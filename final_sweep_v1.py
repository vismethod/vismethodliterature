import asyncio
from playwright.async_api import async_playwright
import os
import csv
import re

# Import the helper we created
# (For the sake of a single script, I'll include the bypass logic directly here or assume it's imported)

async def solve_human_check(page):
    try:
        # Check for Cloudflare/Turnstile
        iframes = page.frames
        for frame in iframes:
            if "turnstile" in frame.url or "cloudflare" in frame.url:
                print(f"  [Bypass] Found verification frame: {frame.url}")
                # Try to find the checkbox or the main container
                selectors = ['.ctp-checkbox-label', 'input[type="checkbox"]', '#challenge-stage', '.ctp-checkbox-container']
                for s in selectors:
                    try:
                        box = await frame.query_selector(s)
                        if box:
                            print(f"  [Bypass] Clicking verification box ({s})...")
                            await box.click()
                            await asyncio.sleep(5)
                            return True
                    except:
                        continue
        return False
    except:
        return False

async def attempt_paper_recovery(title, query, papers_dir, csv_path):
    print(f"\n[Recovering] {title}")
    
    # Safe filename
    clean_title = re.sub(r'[^a-zA-Z0-9 ]', '', title)
    filename = f"{clean_title[:100]}.pdf"
    save_path = os.path.join(papers_dir, filename)
    
    async with async_playwright() as p:
        # Headful mode is critical for human checks
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
        )
        page = await context.new_page()
        
        found = False
        def handle_response(response):
            nonlocal found
            if "application/pdf" in response.headers.get("content-type", "").lower():
                print(f"  [Success] Intercepted PDF: {response.url}")
                try:
                    # We have to be careful with async here, but usually page.wait_for_download is cleaner
                    pass
                except:
                    pass

        # Use the download event for robust saving
        download_found = False
        
        async def on_download(download):
            nonlocal download_found
            print(f"  [Success] Download triggered: {download.url}")
            await download.save_as(save_path)
            download_found = True

        page.on("download", on_download)
        
        # Search via DuckDuckGo
        search_url = f"https://duckduckgo.com/?q={query.replace(' ', '+')}+filetype:pdf"
        try:
            await page.goto(search_url, wait_until="load")
            await asyncio.sleep(3)
            
            # Identify first few results
            links = await page.query_selector_all(".result__a")
            urls_to_visit = []
            for link in links[:5]:
                href = await link.get_attribute("href")
                if href and not "duckduckgo.com" in href:
                    urls_to_visit.append(href)
            
            for url in urls_to_visit:
                if download_found: break
                print(f"  [Visiting] {url}")
                try:
                    await page.goto(url, timeout=30000)
                    await asyncio.sleep(5)
                    
                    # Detect and solve human check
                    await solve_human_check(page)
                    
                    # Look for download buttons
                    btn_selectors = ["a:has-text('PDF')", "a:has-text('Download')", "button:has-text('Download')", ".js-target-download-btn"]
                    for s in btn_selectors:
                        btn = await page.query_selector(s)
                        if btn:
                            print(f"  [Action] Clicking {s}")
                            await btn.click()
                            await asyncio.sleep(5)
                            if download_found: break
                except:
                    continue
        except Exception as e:
            print(f"  [Error] {e}")
            
        await browser.close()
        return download_found

async def main():
    papers_dir = "papers"
    csv_path = "paper_search_results.csv"
    
    # Get missing titles
    missing = []
    with open(csv_path, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if not row.get('pdf_file') and row.get('label') == 'Keyword-26Mar25-ActivityTracing':
                missing.append(row['title'])
    
    print(f"Starting final sweep for {len(missing)} papers...")
    
    for title in missing[:10]: # Batch of 10 for safety
        query = title
        success = await attempt_paper_recovery(title, query, papers_dir, csv_path)
        if success:
            print(f"Successfully recovered: {title}")
        else:
            print(f"Failed to recover: {title}")
            
if __name__ == "__main__":
    asyncio.run(main())
