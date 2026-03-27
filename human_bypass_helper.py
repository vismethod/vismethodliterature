import asyncio
from playwright.async_api import async_playwright
import os
import random

async def solve_human_check(page):
    """
    Attempts to find and click 'Verify you are human' checkboxes (Cloudflare/Turnstile).
    """
    try:
        print("Checking for human verification boxes...")
        # Look for Cloudflare / Turnstile iframes
        iframes = page.frames
        for frame in iframes:
            if "turnstile" in frame.url or "cloudflare" in frame.url:
                print(f"Found verification iframe: {frame.url}")
                # Try to find the checkbox
                checkbox = await frame.query_selector('input[type="checkbox"]')
                if checkbox:
                    print("Found checkbox! Clicking...")
                    await checkbox.click()
                    await asyncio.sleep(5)
                    return True
                
                # Check for big buttons inside the frame
                button = await frame.query_selector('button#challenge-stage')
                if not button:
                    button = await frame.query_selector('.ctp-checkbox-container')
                
                if button:
                    print("Found verification button/box! Clicking...")
                    await button.click()
                    await asyncio.sleep(5)
                    return True
        return False
    except Exception as e:
        print(f"Error solving human check: {e}")
        return False

async def download_paper(title, url, save_path):
    async with async_playwright() as p:
        # Use headful and a large window
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
        )
        page = await context.new_page()
        
        print(f"Targeting: {title}")
        print(f"URL: {url}")
        
        found = False
        def handle_response(response):
            nonlocal found
            if "application/pdf" in response.headers.get("content-type", "").lower():
                print(f"Intercepted PDF binary from {response.url}")
                try:
                    data = asyncio.run_coroutine_threadsafe(response.body(), asyncio.get_event_loop()).result()
                    with open(save_path, "wb") as f:
                        f.write(data)
                    found = True
                    print(f"Saved to {save_path}")
                except:
                    pass

        page.on("response", handle_response)
        
        try:
            await page.goto(url, wait_until="load", timeout=60000)
            await asyncio.sleep(5)
            
            # Check for human check
            did_bypass = await solve_human_check(page)
            if did_bypass:
                print("Bypass triggered, waiting for reload...")
                await asyncio.sleep(10)
            
            # Try to find download button
            selectors = [
                "a:has-text('Download PDF')", 
                "a:has-text('Full text PDF')", 
                "button:has-text('Download')",
                ".js-target-download-btn"
            ]
            for s in selectors:
                btn = await page.query_selector(s)
                if btn:
                    print(f"Found download button ({s}). Clicking...")
                    await btn.click()
                    await asyncio.sleep(10)
                    if found: break
                    
        except Exception as e:
            print(f"Error: {e}")
            
        await browser.close()
        return found

# Example usage for Paper 1 and 2
if __name__ == "__main__":
    # This is a template for the final sweep
    pass
