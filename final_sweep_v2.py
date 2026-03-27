import asyncio
from playwright.async_api import async_playwright
import os
import csv
import re

# Refined sweep script with better matching and human-bypass
async def solve_human_check(page):
    try:
        iframes = page.frames
        for frame in iframes:
            if "turnstile" in frame.url or "cloudflare" in frame.url or "challenge" in frame.url:
                print(f"  [Bypass] Found verification frame: {frame.url}")
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

async def attempt_paper_recovery(title, papers_dir):
    print(f"\n[Recovering] {title}")
    clean_title = re.sub(r'[^a-zA-Z0-9 ]', '', title)
    filename = f"{clean_title[:80]}.pdf"
    save_path = os.path.join(papers_dir, filename)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
        )
        page = await context.new_page()
        
        download_found = False
        async def on_download(download):
            nonlocal download_found
            print(f"  [Success] Download triggered: {download.url}")
            await download.save_as(save_path)
            download_found = True

        page.on("download", on_download)
        
        # Multi-query strategy
        queries = [
            f'"{title}" filetype:pdf',
            f'"{title}" site:researchgate.net',
            f'"{title}" site:academia.edu',
            f'"{title}" site:.edu'
        ]
        
        for q in queries:
            if download_found: break
            search_url = f"https://duckduckgo.com/?q={q.replace(' ', '+')}"
            print(f"  [Searching] {q}")
            try:
                await page.goto(search_url, wait_until="load", timeout=30000)
                await asyncio.sleep(3)
                
                links = await page.query_selector_all(".result__a")
                for link in links[:3]:
                    if download_found: break
                    url = await link.get_attribute("href")
                    if not url or "duckduckgo.com" in url: continue
                    
                    print(f"  [Visiting] {url}")
                    try:
                        await page.goto(url, timeout=30000)
                        await asyncio.sleep(5)
                        await solve_human_check(page)
                        
                        # Look for common download elements
                        btn_selectors = [
                            "a:has-text('PDF')", "a:has-text('Download')", 
                            "button:has-text('Download')", "a.pdf-link",
                            "a[href$='.pdf']"
                        ]
                        for s in btn_selectors:
                            try:
                                btn = await page.query_selector(s)
                                if btn:
                                    print(f"  [Action] Clicking {s}")
                                    await btn.click()
                                    await asyncio.sleep(5)
                                    if download_found: break
                            except: continue
                    except: continue
            except: continue
            
        await browser.close()
        return download_found

async def main():
    papers_dir = "papers"
    csv_path = "paper_search_results.csv"
    
    # Get missing titles for Keyword-26Mar25-ActivityTracing
    missing = []
    with open(csv_path, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if not row.get('pdf_file') and row.get('label') == 'Keyword-26Mar25-ActivityTracing':
                missing.append(row['title'])
    
    print(f"Starting deep sweep for {len(missing)} papers...")
    
    for title in missing[10:20]: # Batch 2 (Papers 10-20)
        success = await attempt_paper_recovery(title, papers_dir)
        if success:
            print(f"Successfully recovered: {title}")
        else:
            print(f"Failed to recover: {title}")

if __name__ == "__main__":
    asyncio.run(main())
