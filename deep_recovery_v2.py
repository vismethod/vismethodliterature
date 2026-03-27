import csv
import os
import re
import time
import random
import asyncio
from playwright.async_api import async_playwright
from playwright_stealth import Stealth

csv_path = 'paper_search_results.csv'
papers_dir = 'papers'
base_path = '/Users/zezhongwang/Downloads/VIS-Method/papers'

def safe_filename(title, year):
    clean = re.sub(r'[\\/*?:"<>|]', '_', title)
    if year and str(year).strip():
        return f"{year} - {clean}.pdf"
    return f"{clean}.pdf"

def is_valid_pdf(path):
    try:
        if not os.path.exists(path): return False
        with open(path, 'rb') as f:
            return f.read(4) == b'%PDF'
    except:
        return False

async def search_and_download_v2(title, year, doi, target_path):
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
        )
        page = await context.new_page()
        await Stealth().apply_stealth_async(page)
        
        captured_path = None

        async def handle_response(response):
            nonlocal captured_path
            if captured_path: return
            content_type = response.headers.get("content-type", "").lower()
            if "application/pdf" in content_type:
                try:
                    data = await response.body()
                    if data.startswith(b'%PDF'):
                        with open(target_path, 'wb') as f:
                            f.write(data)
                        captured_path = target_path
                except:
                    pass

        async def handle_download(download):
            nonlocal captured_path
            if captured_path: return
            try:
                await download.save_as(target_path)
                if is_valid_pdf(target_path):
                    captured_path = target_path
            except:
                pass

        # Domains to search
        priority_domains = ["pure.tue.nl", "researchgate", "academia", "arxiv", "semanticscholar", "springer", "science", "acm.org", "ieee.org", "plos.org", "nlm.nih.gov"]
        
        # 1. Try DuckDuckGo first (more lenient)
        queries = [
            f'{title} filetype:pdf',
            f'"{title}" researcher'
        ]
        
        # 1. Try DuckDuckGo
        for search_query in [q for q in queries if q]:
            if captured_path: break
            try:
                await page.goto(f"https://duckduckgo.com/?q={search_query.replace(' ', '+')}")
                await asyncio.sleep(random.uniform(5, 8))
                
                # Fetch all hrefs first to avoid context destruction
                results = await page.query_selector_all("a[data-testid='result-title-a'], a.result__a")
                if not results: results = await page.query_selector_all("a")
                
                hrefs = []
                for res in results[:10]:
                    try:
                        h = await res.get_attribute("href")
                        if h: hrefs.append(h)
                    except: pass
                
                for href in hrefs:
                    if captured_path: break
                    if not href or any(ignore in href for ignore in ["duckduckgo", "google"]): continue
                    
                    if any(domain in href.lower() for domain in priority_domains) or "pdf" in href.lower():
                        print(f"  Visiting: {href[:60]}...")
                        try:
                            # Use a new context-like navigation or just goto
                            await page.goto(href, wait_until="domcontentloaded", timeout=30000)
                            await asyncio.sleep(10)
                            
                            if not captured_path:
                                buttons = await page.query_selector_all("a:has-text('Download'), button:has-text('Download'), a:has-text('PDF'), a[href$='.pdf']")
                                for btn in buttons[:3]:
                                    try:
                                        await btn.click()
                                        await asyncio.sleep(10)
                                        if captured_path: break
                                    except: pass
                        except: pass
            except Exception as e:
                print(f"  Query Error: {e}")
                pass

        # 2. Try Google (Secondary) if still no success
        if not captured_path:
            try:
                search_query = f'"{title}" filetype:pdf'
                await page.goto(f"https://www.google.com/search?q={search_query.replace(' ', '+')}")
                await asyncio.sleep(random.uniform(5, 8))
                
                # Check for direct links
                results = await page.query_selector_all("a")
                for res in results:
                    href = await res.get_attribute("href")
                    if href and any(domain in href.lower() for domain in priority_domains):
                        print(f"  Trying Google link: {href[:60]}...")
                        await page.goto(href, wait_until="domcontentloaded", timeout=20000)
                        await asyncio.sleep(10)
                        if captured_path: break
            except:
                pass

        await browser.close()
        return captured_path

async def main():
    if not os.path.exists(papers_dir):
        os.makedirs(papers_dir)

    # Load missing papers
    missing = []
    with open(csv_path, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        for row in reader:
            if row.get('label') == 'Keyword-26Mar25-ActivityTracing' and not row.get('pdf_file'):
                missing.append(row)

    print(f"Found {len(missing)} missing papers for Phase 2.")

    for i, row in enumerate(missing):
        title = row['title']
        year = row.get('year', '')
        doi = row.get('doi', '')
        
        filename = safe_filename(title, year)
        target_path = os.path.join(base_path, filename)
        
        print(f"[{i+1}/{len(missing)}] Recovering: {title}...")
        
        path = await search_and_download_v2(title, year, doi, target_path)
        
        if path:
            print(f"  -> SUCCESS: {filename}")
            # Update CSV immediately
            all_rows = []
            with open(csv_path, 'r', encoding='utf-8-sig') as f_read:
                csv_reader = csv.DictReader(f_read)
                for r in csv_reader:
                    if r['title'] == title:
                        r['pdf_file'] = path
                        r['download_status'] = 'downloaded'
                    all_rows.append(r)
            
            with open(csv_path, 'w', encoding='utf-8-sig', newline='') as f_write:
                writer = csv.DictWriter(f_write, fieldnames=fieldnames)
                writer.writeheader()
                writer.writerows(all_rows)
        else:
            print(f"  -> Failed.")
        
        # Batch delay
        await asyncio.sleep(random.uniform(5, 15))

if __name__ == "__main__":
    asyncio.run(main())
