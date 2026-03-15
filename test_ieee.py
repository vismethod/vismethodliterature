import sys
from playwright.sync_api import sync_playwright

def run():
    url = "https://ieeexplore.ieee.org/abstract/document/9140811/"
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = context.new_page()
        
        pdf_body = []
        def handle_response(response):
            try:
                if "application/pdf" in response.headers.get("content-type", ""):
                    print(f"Intercepted PDF! URL: {response.url}")
                    pdf_body.append(response.body())
            except Exception as e:
                print(f"Error reading body: {e}")

        page.on("response", handle_response)
        
        print("Navigating to:", url)
        try:
            page.goto(url, wait_until="domcontentloaded")
            page.wait_for_timeout(5000)
            
            # Click the PDF link if present
            loc = page.locator("a:has-text('PDF')").first
            if loc.is_visible():
                href = loc.get_attribute("href")
                if href:
                    from urllib.parse import urljoin
                    pdf_view_url = urljoin(url, href)
                    print(f"Found PDF viewer link: {pdf_view_url}")
                    page.goto(pdf_view_url, wait_until="domcontentloaded")
                    page.wait_for_timeout(8000)
                    
                    frames = page.frames
                    print(f"Found {len(frames)} frames on new page")
                    for f in frames:
                        print(f"  Frame URL: {f.url}")
                        if ".pdf" in f.url.lower():
                            print(f"  -> SUCCESS! Found PDF frame: {f.url}")
                            # We can just download this URL
                            break
            else:
                print("No PDF link found.")
                
        except Exception as e:
            print("Exception:", e)
        finally:
            browser.close()

if __name__ == "__main__":
    run()
