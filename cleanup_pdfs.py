import csv
import os
import shutil
from collections import defaultdict

def sync_pdfs():
    csv_file = 'paper_search_results.csv'
    papers_dir = 'papers'
    backup_dir = 'papers_backup'
    
    if not os.path.exists(papers_dir):
        os.makedirs(papers_dir)
    if not os.path.exists(backup_dir):
        os.makedirs(backup_dir)
        
    # Mapping filename -> final destination (True if papers/, False if papers_backup/)
    # Default is False (backup), but any 'included' or 'maybe' row flips it to True (live).
    file_destinations = defaultdict(lambda: False)
    
    print(f"Analyzing {csv_file} for PDF status conflicts...")
    
    with open(csv_file, mode='r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            status = row.get('include_guess', '').lower().strip()
            pdf_path = row.get('pdf_file', '').strip().replace('"', '') # Strip quotes just in case
            
            if not pdf_path:
                continue
                
            filename = os.path.basename(pdf_path)
            
            # If ANY record for this file is 'included' or 'maybe', we want to keep it live.
            if status in ['included', 'maybe']:
                file_destinations[filename] = True
            elif filename not in file_destinations:
                # If we haven't seen an 'included' record yet, mark it as backup.
                # If we see an 'included' record later for the same file, it will flip to True.
                file_destinations[filename] = False

    counts = {
        'moved_to_live': 0,
        'moved_to_backup': 0,
        'missing': 0,
        'already_correct': 0
    }

    # Perform moves
    for filename, should_be_live in file_destinations.items():
        live_path = os.path.join(papers_dir, filename)
        backup_path = os.path.join(backup_dir, filename)
        
        if should_be_live:
            if os.path.exists(backup_path):
                shutil.move(backup_path, live_path)
                counts['moved_to_live'] += 1
                print(f"RESTORING: {filename}")
            elif os.path.exists(live_path):
                counts['already_correct'] += 1
            else:
                counts['missing'] += 1
        else:
            if os.path.exists(live_path):
                shutil.move(live_path, backup_path)
                counts['moved_to_backup'] += 1
                print(f"BACKING UP: {filename}")
            elif os.path.exists(backup_path):
                counts['already_correct'] += 1
            else:
                counts['missing'] += 1
                
    print(f"\nFinal Sync Stats:")
    print(f"- Restored to live folder: {counts['moved_to_live']}")
    print(f"- Moved to backup: {counts['moved_to_backup']}")
    print(f"- Files correctly placed: {counts['already_correct']}")
    if counts['missing'] > 0:
        print(f"- Files missing globally: {counts['missing']}")

if __name__ == "__main__":
    sync_pdfs()
