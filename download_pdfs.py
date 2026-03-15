import csv
import os
import re
import requests

csv_path = 'paper_search_results.csv'
papers_dir = 'papers'

if not os.path.exists(papers_dir):
    os.makedirs(papers_dir)

def clean_filename(title):
    return re.sub(r'[/\\?%*:|"<>_]', '_', title)

success_count = 0
fail_count = 0
skip_count = 0

rows = []
with open(csv_path, 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    fieldnames = reader.fieldnames
    for row in reader:
        rows.append(row)

headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/pdf,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Connection': 'keep-alive',
}

for row in rows:
    title = row.get('title', 'Unknown Title')
    year = row.get('year', 'Unknown Year')
    pdf_url = row.get('pdf_url') or row.get('semantic_open_pdf')
    existing_pdf_file = row.get('pdf_file', '').strip()

    expected_filename = ""
    if existing_pdf_file:
        expected_filename = os.path.basename(existing_pdf_file)
    else:
        cleaned_title = clean_filename(title)
        expected_filename = f"{year} - {cleaned_title}.pdf"

    pdf_path = os.path.join(papers_dir, expected_filename)

    # Check if file exists and has content
    if os.path.exists(pdf_path) and os.path.getsize(pdf_path) > 1000:
        skip_count += 1
        if not existing_pdf_file:
            row['pdf_file'] = f"/Users/zezhongwang/Downloads/papers/{expected_filename}"
        continue

    if not pdf_url:
        fail_count += 1
        continue

    print(f"Downloading: {title}\n  URL: {pdf_url}")
    try:
        response = requests.get(pdf_url, headers=headers, timeout=15, verify=False)
        response.raise_for_status()
        
        # Check if it's actually a PDF or an HTML login page
        content_type = response.headers.get('Content-Type', '')
        if 'text/html' in content_type:
            print(f"  -> Failed: Server returned HTML instead of PDF (likely a paywall/captcha).")
            fail_count += 1
            continue

        with open(pdf_path, 'wb') as out_file:
            out_file.write(response.content)
            
        success_count += 1
        row['pdf_file'] = f"/Users/zezhongwang/Downloads/papers/{expected_filename}"
        row['download_status'] = 'downloaded'
        print("  -> Success")
    except Exception as e:
        fail_count += 1
        print(f"  -> Failed: {e}")
        # Clean up empty/corrupt files
        if os.path.exists(pdf_path):
            os.remove(pdf_path)

# Write back updated CSV
try:
    with open(csv_path, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    print("\nUpdated CSV with new file paths.")
except Exception as e:
    print(f"\nFailed to update CSV: {e}")

print(f"\nFinished. Success: {success_count}, Failed: {fail_count}, Skipped (Already Exists/No URL): {skip_count}")
