import os
import csv
import re
from pypdf import PdfReader

def sanitize_filename(name):
    return re.sub(r'[^a-zA-Z0-9 \-_]', '', name).strip()

def normalize_text(text):
    if not text: return ""
    return re.sub(r'[^a-z0-9]', '', text.lower())

def identify_and_rename(csv_path, papers_dir):
    if not os.path.exists(csv_path):
        print(f"CSV not found: {csv_path}")
        return
    
    # 1. Load missing papers from CSV
    missing_papers = []
    with open(csv_path, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        fieldnames = list(reader.fieldnames)
        for row in reader:
            if not row.get('pdf_file'):
                missing_papers.append(row)
    
    if not missing_papers:
        print("No missing papers to link.")
        return

    # 2. Identify orphaned PDFs
    linked_files = set()
    with open(csv_path, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get('pdf_file'):
                linked_files.add(row['pdf_file'])
    
    all_files = [f for f in os.listdir(papers_dir) if f.lower().endswith('.pdf')]
    orphans = [f for f in all_files if f not in linked_files]
    
    if not orphans:
        print("No orphaned PDFs found to identify.")
        return

    print(f"Scanning {len(orphans)} orphaned PDFs against {len(missing_papers)} missing records...")
    
    updated_rows = []
    matches_found = 0
    
    # Re-read all rows for updating
    all_rows = []
    with open(csv_path, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        all_rows = list(reader)

    for orphan in orphans:
        orphan_path = os.path.join(papers_dir, orphan)
        print(f"  [Checking] {orphan}...")
        try:
            reader = PdfReader(orphan_path)
            # Read first 2 pages for maximum title/abstract coverage
            text = ""
            for i in range(min(len(reader.pages), 2)):
                text += reader.pages[i].extract_text() or ""
            
            norm_content = normalize_text(text)
            if not norm_content:
                continue
            
            for row in all_rows:
                if row.get('pdf_file'): continue
                
                title = row.get('title', '')
                norm_title = normalize_text(title)
                
                # Check if entire title appears in PDF content
                if norm_title and norm_title in norm_content:
                    print(f"    [MATCH FOUND] Title: {title}")
                    
                    # Construct new filename
                    new_filename = f"{sanitize_filename(title)}.pdf"
                    new_path = os.path.join(papers_dir, new_filename)
                    
                    # Rename the file if different
                    if orphan != new_filename:
                        # Handle collision
                        count = 1
                        while os.path.exists(new_path):
                            new_filename = f"{sanitize_filename(title)}_{count}.pdf"
                            new_path = os.path.join(papers_dir, new_filename)
                            count += 1
                        
                        os.rename(orphan_path, new_path)
                        print(f"    [RENAMED] {orphan} -> {new_filename}")
                    
                    row['pdf_file'] = new_filename
                    row['download_status'] = 'downloaded'
                    matches_found += 1
                    break # Found match for this orphan
        except Exception as e:
            print(f"    [ERROR] Reading {orphan}: {e}")

    if matches_found > 0:
        with open(csv_path, 'w', encoding='utf-8-sig', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(all_rows)
        print(f"\nSuccessfully identified and linked {matches_found} papers by content.")
    else:
        print("\nNo content-based matches found.")

if __name__ == "__main__":
    identify_and_rename("paper_search_results.csv", "papers")
