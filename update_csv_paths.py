import csv
import os
import re

csv_path = 'paper_search_results.csv'
papers_dir = 'papers'

files = [f for f in os.listdir(papers_dir) if f.endswith('.pdf')]

def normalize_name(name):
    # Strip year prefix, extensions, and non-alphanumeric chars
    name = re.sub(r'^\d{4}\s*-\s*', '', name)
    name = re.sub(r'[^a-zA-Z0-9]', '', name).lower()
    name = name.replace('pdf', '')
    return name

file_map = {}
for f in files:
    norm = normalize_name(f)
    file_map[norm] = os.path.join('/Users/zezhongwang/Downloads/VIS-Method/papers', f)

rows = []
update_count = 0

with open(csv_path, 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    fieldnames = reader.fieldnames
    for row in reader:
        rows.append(row)

import difflib

for row in rows:
    title = row.get('title', '')
    if not title: continue
    
    norm_title = normalize_name(title)
    if not norm_title: continue
    
    best_match = None
    best_ratio = 0.0
    
    # 1. Try exact substring
    for f in files:
        n_file = normalize_name(f)
        if norm_title in n_file or n_file in norm_title:
            best_match = f
            best_ratio = 1.0
            break
            
    # 2. Try fuzzy match
    if not best_match:
        for f in files:
            n_file = normalize_name(f)
            # if the file is just a number, skip fuzzy title match
            if n_file.isdigit(): continue 
            
            ratio = difflib.SequenceMatcher(None, norm_title, n_file).ratio()
            if ratio > best_ratio:
                best_ratio = ratio
                best_match = f
                
    if best_match and best_ratio > 0.75:
        matched_path = os.path.join('/Users/zezhongwang/Downloads/VIS-Method/papers', best_match)
        current_path = row.get('pdf_file', '').strip()
        
        if current_path != matched_path:
            row['pdf_file'] = matched_path
            row['download_status'] = 'downloaded'
            update_count += 1
    else:
        # Ensure we don't hold dead links
        old = row.get('pdf_file', '').strip()
        if old and not os.path.exists(old):
            row['pdf_file'] = ''
            row['download_status'] = 'no_open_pdf_found'
            update_count += 1

with open(csv_path, 'w', encoding='utf-8', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)

print(f"Updated {update_count} CSV records to match the current papers directory.")
