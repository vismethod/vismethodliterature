import csv
import os
import re
import requests
import time
from duckduckgo_search import DDGS

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
with DDGS() as ddgs:
    for row in rows:
        if row.get('download_status') == 'downloaded': continue
        
        title = row.get('title', '')
        if not title: continue
        
        print(f"Searching DDG for: {title[:60]}")
        query = f'"{title}" filetype:pdf'
        
        pdf_url = None
        try:
            results = ddgs.text(query, max_results=3)
            for r in results:
                href = r.get('href', '')
                if href.endswith('.pdf') or 'pdf' in href.lower():
                    pdf_url = href
                    print(f"  -> Found search result link: {pdf_url}")
                    break
        except Exception as e:
            print(f"  -> DDG API error: {e}")
            time.sleep(2)
            continue
            
        if not pdf_url:
            print("  -> No PDF link found via DDG.")
            continue
            
        try:
            print(f"  -> Downloading from {pdf_url}")
            r2 = requests.get(pdf_url, headers=headers, timeout=20, verify=False, allow_redirects=True)
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
                
                # save progress immediately
                with open(csv_path, 'w', encoding='utf-8', newline='') as f:
                    writer = csv.DictWriter(f, fieldnames=fieldnames)
                    writer.writeheader()
                    writer.writerows(rows)
            else:
                print("  -> Failed: URL did not return a valid PDF byte sequence.")
        except Exception as e:
            print(f"  -> Download error: {type(e).__name__}")
            
        time.sleep(2) # rate limits

print(f"\nDiscovered and downloaded {success} new PDFs via DuckDuckGo.")
