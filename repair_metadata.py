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
    return re.sub(r'[^a-zA-Z0-9]', '', str(t)).lower()

def is_truncated(text):
    text = clean_text(text)
    return '...' in text or 'ACM Transactions on' in text or 'proceedings of the' in text.lower() or 'the proceedings of' in text.lower()

def extract_doi(row):
    # Try existing doi field
    doi = row.get('doi', '').strip()
    if doi and '/' in doi: return doi
    
    # Try paper_url
    url = row.get('paper_url', '')
    doi_match = re.search(r'10\.\d{4,9}/[-._;()/:A-Z0-9]+', url, re.I)
    if doi_match:
        return doi_match.group(0)
    return None

def repair():
    if not os.path.exists(csv_path):
        print(f"Error: {csv_path} not found.")
        return

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
    to_repair = [r for r in rows if is_truncated(r.get('venue', ''))]
    print(f"Found {len(to_repair)} rows to repair.")

    for i, row in enumerate(rows):
        venue = row.get('venue', '')
        title = row.get('title', '')
        
        if not is_truncated(venue):
            continue
            
        print(f"[{i+1}/{len(rows)}] Repairing: {title[:60]}...")
        
        doi = extract_doi(row)
        match = None
        
        # 1. Try Crossref by DOI
        if doi:
            print(f"  -> Found DOI: {doi}")
            try:
                url = f"https://api.crossref.org/works/{doi}"
                r = requests.get(url, timeout=10, headers={'User-Agent': 'LiterReader/1.0 (mailto:test@example.com)'})
                if r.status_code == 200:
                    match_data = r.json()
                    match = match_data.get('message')
                    print("  -> Match found via DOI lookup.")
            except Exception as e:
                print(f"  -> DOI lookup error: {e}")

        # 2. Try Crossref by Title if DOI failed
        if not match:
            query = title.replace(' ', '+')
            url = f"https://api.crossref.org/works?query.title={query}&rows=5"
            try:
                r = requests.get(url, timeout=10, headers={'User-Agent': 'LiterReader/1.0 (mailto:test@example.com)'})
                if r.status_code == 200:
                    items = r.json().get('message', {}).get('items', [])
                    for item in items:
                        item_title = item.get('title', [''])[0]
                        if normalize_title(title) in normalize_title(item_title) or normalize_title(item_title) in normalize_title(title):
                            match = item
                            print("  -> Match found via Title search.")
                            break
            except Exception as e:
                print(f"  -> Title search error: {e}")

        # 3. Update if match found
        if match:
            authors_list = match.get('author', [])
            author_names = ", ".join([(a.get('given', '') + ' ' + a.get('family', '')).strip() for a in authors_list[:5]])
            if len(authors_list) > 5: author_names += " et al."
            
            container = match.get('container-title', [])
            full_venue = container[0] if container else ""
            if not full_venue:
                # Fallback to journal-title or similar
                full_venue = match.get('short-container-title', [""])[0]
            
            if author_names and full_venue:
                row['venue'] = f"{author_names} - {full_venue}"
                print(f"  -> Success: {row['venue']}")
                
                # Update year
                if match.get('published-print'):
                    pts = match['published-print'].get('date-parts', [[None]])[0]
                    if pts[0]: row['year'] = str(pts[0])
                elif match.get('published-online'):
                    pts = match['published-online'].get('date-parts', [[None]])[0]
                    if pts[0]: row['year'] = str(pts[0])
                
                if match.get('DOI'): row['doi'] = match['DOI']
                total_repaired += 1
            else:
                print("  -> Match found but metadata extraction failed.")
        else:
            print("  -> No match found in Crossref.")
            
        time.sleep(1)

    with open(csv_path, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"\nFinal: Repaired {total_repaired} rows.")

if __name__ == "__main__":
    repair()
