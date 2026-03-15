import csv
import os
import re
from pypdf import PdfReader

csv_path = 'paper_search_results.csv'
papers_dir = 'papers'

def normalize_text(text):
    return re.sub(r'[^a-zA-Z0-9]', '', str(text)).lower()

def safe_filename(name):
    return re.sub(r'[/\\?%*:|"<>_]', '_', name)

with open(csv_path, 'r', encoding='utf-8') as f:
    rows = list(csv.DictReader(f))
    if rows:
        fieldnames = rows[0].keys()
    else:
        fieldnames = []

# Build title map of unmatched rows
unmatched_rows = [r for r in rows if r.get('download_status') != 'downloaded']
db_titles = {normalize_text(r['title']): r for r in unmatched_rows if r.get('title')}

# Get all pdfs
files = [f for f in os.listdir(papers_dir) if f.endswith('.pdf')]

updated_count = 0
for f in files:
    # Skip if file is already linked in the CSV
    already_matched = any(f in str(r.get('pdf_file', '')) for r in rows if r.get('pdf_file'))
    if already_matched: 
        continue

    file_path = os.path.join(papers_dir, f)
    print(f"Inspecting unmatched PDF: {f}...")
    
    try:
        reader = PdfReader(file_path)
        if len(reader.pages) == 0:
            continue
        text = reader.pages[0].extract_text()
        if not text:
            for page in reader.pages:
                text = page.extract_text()
                if text: break
        
        norm_text = normalize_text(text)
        
        best_match = None
        
        for norm_title, row in db_titles.items():
            if len(norm_title) < 10: continue
            
            # Simple substring match works beautifully for stripped text
            if norm_title in norm_text:
                best_match = row
                break
        
        if best_match:
            title = best_match['title']
            year = best_match.get('year', '2024')
            if not year: year = '2024'
            new_name = f"{year} - {safe_filename(title)}.pdf"
            new_path = os.path.join(papers_dir, new_name)
            
            # Rename file
            if os.path.exists(new_path) and new_path != file_path:
                os.remove(new_path)
            if new_path != file_path:
                os.rename(file_path, new_path)
            
            # Update row
            abs_path = os.path.abspath(new_path)
            best_match['pdf_file'] = abs_path
            best_match['download_status'] = 'downloaded'
            best_match['is_open_access'] = 'True'
            
            # Remove from unmatched pool to prevent duplicate links
            del db_titles[normalize_text(title)]
            
            print(f"  -> Matched to: {title}")
            print(f"  -> Renamed to: {new_name}")
            updated_count += 1
        else:
            print(f"  -> No title match found in the document's text.")
            
    except Exception as e:
        print(f"  -> Error reading PDF: {e}")

if updated_count > 0:
    with open(csv_path, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    print(f"\nSuccessfully renamed and matched {updated_count} files!")
else:
    print("\nNo new files were matched. The remaining files might not be papers from the CSV.")
