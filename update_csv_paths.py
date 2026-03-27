import csv
import os
import re

csv_path = 'paper_search_results.csv'
papers_dir = 'papers'

def normalize_name(name):
    # Strip year prefix, extensions, and non-alphanumeric chars
    name = re.sub(r'^\d{4}\s*-\s*', '', name)
    name = re.sub(r'[^a-zA-Z0-9]', '', name).lower()
    name = name.replace('pdf', '')
    return name

files = []
file_map = {}
if os.path.exists(papers_dir):
    for paper_file in os.listdir(papers_dir):
        if not paper_file.endswith('.pdf'):
            continue
            
        full_path = os.path.join(papers_dir, paper_file)
        # Verify it's valid PDF binary
        try:
            with open(full_path, 'rb') as f:
                header = f.read(4)
                if header != b'%PDF':
                    continue
        except Exception:
            continue
            
        files.append(paper_file)
        norm = normalize_name(paper_file)
        file_map[norm] = full_path

file_map = {}
for f in files:
    norm = normalize_name(f)
    file_map[norm] = os.path.join('/Users/zezhongwang/Downloads/VIS-Method/papers', f)

rows = []
update_count = 0

with open(csv_path, 'r', encoding='utf-8-sig') as f:
    reader = csv.DictReader(f)
def normalize_title(title):
    if not title:
        return ""
    # Add spaces around transitions from lower to upper case (CamelCase)
    title = re.sub(r'([a-z])([A-Z])', r'\1 \2', title)
    return re.sub(r'[^a-z0-9 ]', ' ', title.lower()).strip()

def get_bag_of_words(text):
    # Split on any whitespace and filter out short words
    words = normalize_title(text).split()
    return set(w for w in words if len(w) > 2 or w.isdigit())

def update_csv_links(csv_path, papers_dir):
    if not os.path.exists(csv_path):
        print(f"CSV not found: {csv_path}")
        return
    
    # Pre-index files by normalized name parts
    paper_files = [f for f in os.listdir(papers_dir) if f.lower().endswith('.pdf')]
    paper_bags = [(f, get_bag_of_words(f)) for f in paper_files]
    
    rows = []
    updated_count = 0
    
    # Use utf-8-sig to handle BOM
    with open(csv_path, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        fieldnames = list(reader.fieldnames) if reader.fieldnames else []
        for row in reader:
            # If pdf_file is already set and valid, keep it
            current_pdf = row.get('pdf_file', '').strip()
            if current_pdf and os.path.exists(os.path.join(papers_dir, current_pdf)):
                rows.append(row)
                continue
            
            # Try fuzzy matching
            title = row.get('title', '')
            if not title:
                rows.append(row)
                continue
                
            title_bag = get_bag_of_words(title)
            if not title_bag:
                rows.append(row)
                continue
                
            best_match = None
            best_score = 0
            
            for filename, file_bag in paper_bags:
                # Intersection over union (or just intersection over title words)
                if not file_bag: continue
                intersection = title_bag.intersection(file_bag)
                score = len(intersection) / len(title_bag)
                
                if score > best_score:
                    best_score = score
                    best_match = filename
            
            # Use a threshold to avoid false positives (e.g. 25% of title words must match)
            if best_match and best_score >= 0.25:
                row['pdf_file'] = best_match
                if 'download_status' in row:
                    row['download_status'] = 'downloaded'
                updated_count += 1
            
            rows.append(row)
            
    with open(csv_path, 'w', encoding='utf-8-sig', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
        
    print(f"Updated {updated_count} CSV records to match the current papers directory.")

if __name__ == "__main__":
    update_csv_links("paper_search_results.csv", "papers")
