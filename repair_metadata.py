import csv
import os
import requests
import time
import re

csv_path = 'paper_search_results.csv'
backup_path = 'paper_search_results.csv.bak'

def clean_text(text):
    if not text: return ""
    return str(text).replace('…', '...').strip()

def normalize_title(t):
    # Remove all non-alphanumeric and lowercase
    return re.sub(r'[^a-zA-Z0-9]', '', str(t)).lower()

def is_truncated(text):
    text = clean_text(text)
    return '...' in text

def repair():
    if not os.path.exists(csv_path):
        print(f"Error: {csv_path} not found.")
        return

    # Backup
    import shutil
    shutil.copy2(csv_path, backup_path)
    print(f"Backup created at {backup_path}")

    rows = []
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        for row in reader:
            rows.append(row)

    total_repaired = 0
    total_to_check = sum(1 for r in rows if is_truncated(r.get('venue', '')))
    
    print(f"Found {total_to_check} rows with potentially truncated venue info.")

    for i, row in enumerate(rows):
        venue = row.get('venue', '')
        title = row.get('title', '')
        
        if not is_truncated(venue):
            continue
            
        print(f"[{i+1}/{len(rows)}] Repairing: {title[:60]}...")
        
        # Query Crossref API with more rows to find best match
        query = title.replace(' ', '+')
        url = f"https://api.crossref.org/works?query.title={query}&rows=10"
        
        try:
            r = requests.get(url, timeout=15, headers={'User-Agent': 'LiterReader/1.0 (mailto:test@example.com)'})
            r.raise_for_status()
            data = r.json()
            
            items = data.get('message', {}).get('items', [])
            found_best = False
            for match in items:
                match_titles = match.get('title', [])
                if not match_titles: continue
                match_title = match_titles[0]
                
                # Check title similarity with normalization
                if normalize_title(title) in normalize_title(match_title) or normalize_title(match_title) in normalize_title(title):
                    # Extract authors
                    authors = match.get('author', [])
                    author_names = ", ".join([(a.get('given', '') + ' ' + a.get('family', '')).strip() for a in authors[:5]])
                    if len(authors) > 5: author_names += " et al."
                    
                    # Extract venue
                    container = match.get('container-title', [])
                    full_venue = container[0] if container else ""
                    
                    if author_names and full_venue:
                        new_venue = f"{author_names} - {full_venue}"
                        print(f"  -> Success: {new_venue}")
                        row['venue'] = new_venue
                        if match.get('published-print'):
                            parts = match['published-print'].get('date-parts', [[None]])[0]
                            if parts[0]: row['year'] = str(parts[0])
                        elif match.get('published-online'):
                            parts = match['published-online'].get('date-parts', [[None]])[0]
                            if parts[0]: row['year'] = str(parts[0])
                        if match.get('DOI'):
                            row['doi'] = match['DOI']
                        total_repaired += 1
                        found_best = True
                        break
                else:
                    # Inner else for normalize_title check if we want to log it
                    pass
                
            if not found_best:
                print("  -> No match found in Crossref results.")
                
        except Exception as e:
            print(f"  -> API error: {e}")
            
        time.sleep(1)

    # Save back to CSV
    with open(csv_path, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"\nRepair complete. Updated {total_repaired} rows.")

if __name__ == "__main__":
    repair()
