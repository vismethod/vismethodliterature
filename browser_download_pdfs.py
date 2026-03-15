import csv
import os
import re
from urllib.parse import urljoin
from playwright.sync_api import sync_playwright, TimeoutError

csv_path = 'paper_search_results.csv'
papers_dir = 'papers'
if not os.path.exists(papers_dir):
    os.makedirs(papers_dir)

def clean_filename(title):
    return re.sub(r'[/\\?%*:|"<>_]', '_', title)

def get_pdf_viewer_url(url):
    # ACM
    acm_match = re.search(r'dl\.acm\.org/doi/(?:abs/)?(10\.\d{4,9}/[-._;()/:A-Z0-9]+)', url, re.I)
    if acm_match:
        return f"https://dl.acm.org/doi/pdf/{acm_match.group(1)}"
        
    # IEEE
    ieee_match = re.search(r'ieeexplore\.ieee\.org/(?:abstract/)?document/(\d+)', url, re.I)
    if ieee_match:
        return f"https://ieeexplore.ieee.org/stamp/stamp.jsp?tp=&arnumber={ieee_match.group(1)}"
        
    return url

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            accept_downloads=True
        )
        page = context.new_page()

        rows = []
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            fieldnames = reader.fieldnames
            for row in reader:
                rows.append(row)

        success = 0
        for row in rows:
            title = row.get('title', 'Unknown Title')
            year = row.get('year', 'Unknown Year')
            pdf_url = row.get('pdf_url') or row.get('paper_url')
            status = row.get('download_status')
            existing_pdf = row.get('pdf_file', '').strip()

            if status == 'downloaded' and existing_pdf and os.path.exists(existing_pdf) and os.path.getsize(existing_pdf) > 1000:
                continue
            if not pdf_url:
                continue
                
            domain_check = pdf_url.lower()
            if not any(d in domain_check for d in ['acm.org', 'ieee.org', 'researchgate', 'sciencedirect']):
                continue

            expected_filename = f"{year} - {clean_filename(title)}.pdf"
            pdf_path = os.path.join(papers_dir, expected_filename)

            if os.path.exists(pdf_path) and os.path.getsize(pdf_path) > 1000:
                row['pdf_file'] = f"/Users/zezhongwang/Downloads/VIS-Method/papers/{expected_filename}"
                row['download_status'] = 'downloaded'
                continue

            target_url = get_pdf_viewer_url(pdf_url)
            print(f"\nOpening: {title[:60]}...\n  Original URL: {pdf_url}\n  Target URL: {target_url}")
            downloaded = False
            
            pdf_body = []
            def handle_response(response):
                try:
                    if response.request.method != "OPTIONS":
                        ct = response.headers.get("content-type", "")
                        if "application/pdf" in ct:
                            pdf_body.append(response.body())
                except Exception:
                    pass

            page.on("response", handle_response)

            try:
                response = page.goto(target_url, wait_until='domcontentloaded', timeout=30000)
                # Wait for any heavy IEEE/ACM JS to load the frames
                page.wait_for_timeout(10000)

                # 1. Did our response listener catch a PDF?
                if len(pdf_body) > 0:
                    with open(pdf_path, 'wb') as f:
                        f.write(pdf_body[0])
                    downloaded = True
                    print("  -> Intercepted PDF via network listener")

                # 2. If it's pure PDF navigation response
                if not downloaded and response and 'application/pdf' in response.headers.get('content-type', ''):
                    with open(pdf_path, 'wb') as f:
                        f.write(response.body())
                    downloaded = True
                    print("  -> Direct PDF navigation")
                
                if downloaded:
                    row['pdf_file'] = f"/Users/zezhongwang/Downloads/VIS-Method/papers/{expected_filename}"
                    row['download_status'] = 'downloaded'
                    success += 1
                    with open(csv_path, 'w', encoding='utf-8', newline='') as f:
                        writer = csv.DictWriter(f, fieldnames=fieldnames)
                        writer.writeheader()
                        writer.writerows(rows)
                else:
                    print("  -> Failed to locate PDF. Checking if it's an access/captcha issue...")
            except Exception as e:
                print(f"  -> Error: {type(e).__name__} - {str(e)}")
            finally:
                page.remove_listener("response", handle_response)

        browser.close()
        print(f"\nDone. Successfully downloaded {success} papers.")

if __name__ == "__main__":
    run()
