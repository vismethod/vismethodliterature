import csv
import os
import shutil

def sync_pdfs():
    csv_file = 'paper_search_results.csv'
    papers_dir = 'papers'
    backup_dir = 'papers_backup'
    
    if not os.path.exists(papers_dir):
        os.makedirs(papers_dir)
    if not os.path.exists(backup_dir):
        os.makedirs(backup_dir)
        
    counts = {
        'moved_to_backup': 0,
        'restored_to_live': 0,
        'already_in_right_place': 0,
        'missing': 0
    }
    
    print(f"Syncing PDFs based on {csv_file}...")
    
    with open(csv_file, mode='r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            status = row.get('include_guess', '').lower().strip()
            pdf_path = row.get('pdf_file', '').strip()
            
            if not pdf_path:
                continue
                
            filename = os.path.basename(pdf_path)
            live_path = os.path.join(papers_dir, filename)
            back_path = os.path.join(backup_dir, filename)
            
            # Categorize: should it be live?
            should_be_live = status in ['included', 'maybe']
            
            if should_be_live:
                if os.path.exists(live_path):
                    counts['already_in_right_place'] += 1
                elif os.path.exists(back_path):
                    shutil.move(back_path, live_path)
                    counts['restored_to_live'] += 1
                else:
                    counts['missing'] += 1
            else:
                # Should be in backup (excluded or blank)
                if os.path.exists(back_path):
                    counts['already_in_right_place'] += 1
                elif os.path.exists(live_path):
                    shutil.move(live_path, back_path)
                    counts['moved_to_backup'] += 1
                else:
                    counts['missing'] += 1
                
    print(f"\nSync complete!")
    print(f"Moved to backup (Excluded/Blank): {counts['moved_to_backup']}")
    print(f"Restored to live (Included/Maybe): {counts['restored_to_live']}")
    print(f"Already in correct location: {counts['already_in_right_place']}")
    if counts['missing'] > 0:
        print(f"Files referenced in CSV but not found: {counts['missing']}")

if __name__ == "__main__":
    sync_pdfs()
