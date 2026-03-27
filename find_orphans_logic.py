import csv
import os
import re

def normalize_title(title):
    if not title: return ""
    title = re.sub(r'([a-z])([A-Z])', r'\1 \2', title)
    return re.sub(r'[^a-z0-9 ]', ' ', title.lower()).strip()

def get_bag_of_words(text):
    words = normalize_title(text).split()
    return set(w for w in words if len(w) > 2 or w.isdigit())

def find_orphans(csv_path, papers_dir):
    linked_files = set()
    with open(csv_path, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get('pdf_file'):
                linked_files.add(row['pdf_file'])
    
    all_files = [f for f in os.listdir(papers_dir) if f.lower().endswith('.pdf')]
    orphans = [f for f in all_files if f not in linked_files]
    
    print(f"Found {len(orphans)} orphaned PDFs.")
    
    missing_rows = []
    with open(csv_path, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        fieldnames = list(reader.fieldnames)
        for row in reader:
            if not row.get('pdf_file'):
                missing_rows.append(row)
                
    print(f"Searching matches for {len(missing_rows)} missing papers...")
    
    matches = []
    for row in missing_rows:
        title = row.get('title', '')
        title_bag = get_bag_of_words(title)
        best_match = None
        best_score = 0
        
        for orphan in orphans:
            orphan_bag = get_bag_of_words(orphan)
            if not orphan_bag: continue
            intersection = title_bag.intersection(orphan_bag)
            score = len(intersection) / len(title_bag)
            if score > best_score:
                best_score = score
                best_match = orphan
        
        if best_match and best_score >= 0.4: # Lower threshold for orphans
            print(f"  [Match] '{title}' -> '{best_match}' (Score: {best_score:.2f})")
            matches.append((row['title'], best_match))

    return matches

if __name__ == "__main__":
    matches = find_orphans("paper_search_results.csv", "papers")
    print(f"Identified {len(matches)} new matches.")
