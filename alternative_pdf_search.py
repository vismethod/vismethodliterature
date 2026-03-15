import csv
import os
import re
import requests
import time

csv_path = 'paper_search_results.csv'
papers_dir = 'papers'
if not os.path.exists(papers_dir):
    os.makedirs(papers_dir)

def clean_filename(title):
    return re.sub(r'[/\\?%*:|"<>_]', '_', title)

rows = []
with open(csv_path, 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    fieldnames = reader.fieldnames
    for row in reader:
        rows.append(row)

headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

success = 0
for row in rows:
    if row.get('download_status') == 'downloaded': continue
    
    title = row.get('title', '')
    if not title: continue
    
    print(f"Searching alternative OA for: {title[:60]}")
    
    # Try Semantic Scholar
    query = title.replace(' ', '+')
    url = f"https://api.semanticscholar.org/graph/v1/paper/search?query={query}&limit=3&fields=openAccessPdf,title"
    oa_url = None
    
    try:
        r = requests.get(url, timeout=10)
        data = r.json()
        if data.get('data') and len(data['data']) > 0:
            for paper_data in data['data']:
                if paper_data.get('openAccessPdf'):
                    oa_url = paper_data['openAccessPdf'].get('url')
                    print(f"  -> Found OA via Semantic Scholar: {oa_url}")
                    break
    except Exception as e:
        pass
        
    # If no OA from S2, try Unpaywall
    if not oa_url:
        try:
            r = requests.get(f"https://api.unpaywall.org/v2/search?query={query}&email=test@example.com", timeout=10)
            data = r.json()
            if data.get('results') and len(data['results']) > 0:
                best = data['results'][0]['response']
                if best.get('is_oa') and best.get('best_oa_location'):
                    oa_url = best['best_oa_location'].get('url_for_pdf')
                    # Unpaywall sometimes gives landing pages even for pdf url...
                    if oa_url: print(f"  -> Found OA via Unpaywall: {oa_url}")
        except Exception as e:
            pass

    if not oa_url:
        print("  -> No OA link found.")
        continue
        
    # Try download
    try:
        print(f"  -> Downloading from {oa_url}")
        r2 = requests.get(oa_url, headers=headers, timeout=20, verify=False, allow_redirects=True)
        # Verify it's actually a PDF by bytes header
        if r2.content[:4] == b'%PDF':
            expected_filename = f"{row.get('year', '2024')} - {clean_filename(title)}.pdf"
            pdf_path = os.path.join(papers_dir, expected_filename)
            with open(pdf_path, 'wb') as f:
                f.write(r2.content)
            
            row['pdf_file'] = f"/Users/zezhongwang/Downloads/VIS-Method/papers/{expected_filename}"
            row['download_status'] = 'downloaded'
            row['is_open_access'] = 'True'
            success += 1
            print("  -> Success!")
        else:
            print("  -> Failed: URL did not return a valid PDF byte sequence.")
    except Exception as e:
        print(f"  -> Download error: {type(e).__name__}")
        
    time.sleep(1) # Rate limit APIs gently
    
with open(csv_path, 'w', encoding='utf-8', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)

print(f"\nDiscovered and downloaded {success} new PDFs.")
