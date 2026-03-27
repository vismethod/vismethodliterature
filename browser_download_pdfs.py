import csv
import os
import re
from urllib.parse import urljoin
from playwright.sync_api import sync_playwright
from playwright_stealth import Stealth

csv_path = 'paper_search_results.csv'
papers_dir = 'papers'
if not os.path.exists(papers_dir):
    os.makedirs(papers_dir)

def clean_filename(title):
    return re.sub(r'[/\\?%*:|"<>_]', '_', title)

def is_valid_pdf_binary(path):
    if not os.path.exists(path) or os.path.getsize(path) < 1000:
        return False
    try:
        with open(path, 'rb') as f:
            return f.read(4) == b'%PDF'
    except:
        return False

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

def auto_click_helpers(page):
    """Try to click common download buttons or Cloudflare checkboxes."""
    # 1. ResearchGate / ScienceDirect common buttons
    selectors = [
        '.gtm-download-fulltext-button', 
        'a[data-test-id="download-fulltext-button"]',
        '#pdf-link',
        '.pdf-download-button',
        'a:has-text("Download PDF")'
    ]
    for s in selectors:
        try:
            if page.locator(s).first.is_visible(timeout=1000):
                print(f"  -> Found download button: {s}. Clicking...")
                page.locator(s).first.click()
                page.wait_for_timeout(3000)
        except:
            pass
            
    # 2. Cloudflare / Turnstile (Very basic attempt)
    try:
        # Look for it inside any iframe
        for frame in page.frames:
            if "cloudflare" in frame.url or "turnstile" in frame.url:
                checkbox = frame.locator('input[type="checkbox"]')
                if checkbox.is_visible(timeout=1000):
                    print("  -> Found Cloudflare/Turnstile checkbox. Attempting click...")
                    checkbox.click()
                    page.wait_for_timeout(3000)
    except:
        pass

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            accept_downloads=True
        )
        page = context.new_page()
        Stealth().apply_stealth_sync(page)

        rows = []
        with open(csv_path, 'r', encoding='utf-8-sig') as f:
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

            if status == 'downloaded' and existing_pdf and is_valid_pdf_binary(existing_pdf):
                continue
            if not pdf_url:
                continue
                
            domain_check = pdf_url.lower()
            if not any(d in domain_check for d in ['acm.org', 'ieee.org', 'researchgate', 'sciencedirect']):
                continue

            safe_title = clean_filename(title)
            if year and year != "Unknown Year":
                expected_filename = f"{year} - {safe_title}.pdf"
            else:
                expected_filename = f"{safe_title}.pdf"
            pdf_path = os.path.join(papers_dir, expected_filename)

            if is_valid_pdf_binary(pdf_path):
                row['pdf_file'] = f"/Users/zezhongwang/Downloads/VIS-Method/papers/{expected_filename}"
                row['download_status'] = 'downloaded'
                continue

            target_url = get_pdf_viewer_url(pdf_url)
            print(f"\nOpening: {title[:60]}...\n  URL: {target_url}")
            downloaded = False
            
            pdf_body = []
            def handle_response(response):
                try:
                    if response.request.method != "OPTIONS":
                        ct = response.headers.get("content-type", "").lower()
                        if "application/pdf" in ct:
                            body = response.body()
                            if body.startswith(b'%PDF'):
                                pdf_body.append(body)
                except:
                    pass

            page.on("response", handle_response)

            try:
                page.goto(target_url, wait_until='domcontentloaded', timeout=45000)
                page.wait_for_timeout(5000)
                
                # Check if we should try to click anything
                auto_click_helpers(page)
                page.wait_for_timeout(5000)

                # Did we intercept?
                if len(pdf_body) > 0:
                    with open(pdf_path, 'wb') as f:
                        f.write(pdf_body[0])
                    downloaded = True
                    print("  -> Intercepted PDF binary")

                if downloaded:
                    row['pdf_file'] = f"/Users/zezhongwang/Downloads/VIS-Method/papers/{expected_filename}"
                    row['download_status'] = 'downloaded'
                    success += 1
                    with open(csv_path, 'w', encoding='utf-8-sig', newline='') as f:
                        writer = csv.DictWriter(f, fieldnames=fieldnames)
                        writer.writeheader()
                        writer.writerows(rows)
                else:
                    print("  -> Pending (possibly needs manual solve or button click)")
            except Exception as e:
                print(f"  -> Error: {type(e).__name__}")
            finally:
                page.remove_listener("response", handle_response)

        browser.close()
        print(f"\nBatch complete. Successfully downloaded {success} papers.")

if __name__ == "__main__":
    run()
