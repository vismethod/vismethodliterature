import csv
import os
import re
import time
import requests
from pathlib import Path
from typing import Any, Dict, List, Optional

# =========================
# CONFIG
# =========================
OUTPUT_DIR = Path("/Users/zezhongwang/Downloads/VIS-Method")
PDF_DIR = OUTPUT_DIR / "papers"
CSV_PATH = OUTPUT_DIR / "paper_search_results.csv"

# Configuration
USE_SERPAPI = True
SERPAPI_API_KEY = "a5ea7b3b33234b1f322739785c85746ef1d1c5785171d03de74d2b2a08073328"
SERPAPI_URL = "https://serpapi.com/search.json"

# Search settings
MAX_SERPAPI_PAGES = 10 # Up to 10 pages (200 results)
MAX_S2_RESULTS = 200
SLEEP_SECONDS = 3.0
TARGET_LABEL = "Keyword-26Mar18-ActivityTracing"

# Primary Refined Boolean Query from User
PRIMARY_QUERY = '("video" OR "observation") AND ("visualization" OR "visualiz") AND ("analyz" OR "interpret" OR "understand") AND ("interaction" OR "action") AND ("qualitative") AND ("activity tracing" OR "activity tracking")'

QUERY_LIST = [
    PRIMARY_QUERY,
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; PaperSearchBot/1.0)"
}

# =========================
# HELPERS
# =========================

def normalize(text: str) -> str:
    if not text: return ""
    return text.lower().strip()

def search_semantic_scholar_deep(query: str, total_limit: int = 100) -> List[Dict[str, Any]]:
    print(f"  - Searching Semantic Scholar for: {query[:60]}...")
    all_results = []
    offset = 0
    batch_size = 50
    
    while len(all_results) < total_limit:
        url = "https://api.semanticscholar.org/graph/v1/paper/search"
        params = {
            "query": query,
            "limit": batch_size,
            "offset": offset,
            "fields": "title,abstract,year,venue,citationCount,url,externalIds,openAccessPdf,isOpenAccess"
        }
        try:
            resp = requests.get(url, params=params, headers=HEADERS, timeout=30)
            if resp.status_code == 429:
                print("    Rate limited by Semantic Scholar. Skipping deeper pages.")
                break
            resp.raise_for_status()
            data = resp.json()
            
            results = data.get("data", [])
            if not results: break
            
            for item in results:
                ext = item.get("externalIds", {}) or {}
                all_results.append({
                    "source": "Semantic Scholar",
                    "query": query,
                    "title": item.get("title", ""),
                    "abstract": item.get("abstract", "") or "",
                    "year": item.get("year", ""),
                    "venue": item.get("venue", ""),
                    "citation_count": item.get("citationCount", 0),
                    "paper_url": item.get("url", ""),
                    "doi": ext.get("DOI", ""),
                    "pdf_url": (item.get("openAccessPdf") or {}).get("url", ""),
                    "is_open_access": item.get("isOpenAccess", False),
                    "label": TARGET_LABEL
                })
            
            if len(results) < batch_size: break
            offset += batch_size
            time.sleep(5) # Slow down for S2
        except Exception as e:
            print(f"    Error: {e}")
            break
            
    return all_results

def search_google_scholar_deep(query: str, api_key: str, max_pages: int = 5) -> List[Dict[str, Any]]:
    print(f"  - Searching Google Scholar for: {query[:60]}...")
    all_results = []
    num_per_page = 20
    
    for page in range(max_pages):
        params = {
            "engine": "google_scholar",
            "q": query,
            "num": num_per_page,
            "start": page * num_per_page,
            "api_key": api_key,
        }
        try:
            resp = requests.get(SERPAPI_URL, params=params, headers=HEADERS, timeout=30)
            resp.raise_for_status()
            data = resp.json()
            
            search_info = data.get("search_information", {}) or {}
            total_results = search_info.get("total_results", "unknown")
            if page == 0:
                print(f"    Estimated total results: {total_results}")

            organic = data.get("organic_results", [])
            if not organic: break
            
            for item in organic:
                pub_info = item.get("publication_info", {}) or {}
                summary = pub_info.get("summary", "")
                
                year_match = re.search(r"(20\d{2}|19\d{2})", summary)
                year = year_match.group(1) if year_match else ""
                
                resources = item.get("resources", []) or []
                pdf_url = ""
                for r in resources:
                    if isinstance(r, dict) and ".pdf" in r.get("link", "").lower():
                        pdf_url = r.get("link", "")
                        break

                all_results.append({
                    "source": "Google Scholar (SerpAPI)",
                    "query": query,
                    "title": item.get("title", ""),
                    "abstract": item.get("snippet", "") or "",
                    "year": year,
                    "venue": summary,
                    "citation_count": (item.get("inline_links", {}) or {}).get("cited_by", {}).get("total", 0),
                    "paper_url": item.get("link", ""),
                    "doi": "",
                    "pdf_url": pdf_url,
                    "is_open_access": bool(pdf_url),
                    "label": TARGET_LABEL
                })
            
            print(f"    Found {len(organic)} results on page {page+1}")
            if len(organic) < num_per_page: break
            time.sleep(1)
        except Exception as e:
            print(f"    Error: {e}")
            break
            
    return all_results

def merge_to_csv(new_records: List[Dict[str, Any]], csv_path: Path):
    print(f"Merging {len(new_records)} new records into {csv_path}...")
    
    existing_records = []
    fieldnames = []
    if csv_path.exists():
        with open(csv_path, "r", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            fieldnames = reader.fieldnames
            existing_records = list(reader)
            
    # Check for duplicates by title
    existing_titles = {normalize(r.get("title", "")) for r in existing_records if r.get("title")}
    
    added_count = 0
    for r in new_records:
        if normalize(r.get("title", "")) not in existing_titles:
            # Map search fields to CSV fields
            row = {
                "source": r.get("source", ""),
                "query": r.get("query", ""),
                "title": r.get("title", ""),
                "year": r.get("year", ""),
                "venue": r.get("venue", ""),
                "citation_count": r.get("citation_count", 0),
                "doi": r.get("doi", ""),
                "paper_url": r.get("paper_url", ""),
                "is_open_access": str(r.get("is_open_access", False)),
                "abstract": r.get("abstract", ""),
                "label": r.get("label", ""),
                "inclusion_status": "included", # Marking as included as per previous preference
                "pdf_file": "",
                "download_status": ""
            }
            existing_records.append(row)
            added_count += 1
            
    # Ensure all fieldnames are present
    all_fieldnames = fieldnames if fieldnames else [
        "source", "query", "title", "year", "venue", "citation_count", 
        "relevance_score", "include_guess", "doi", "paper_url", 
        "semantic_open_pdf", "pdf_url", "pdf_file", "download_status", 
        "is_open_access", "abstract", "label", "inclusion_status"
    ]
    
    with open(csv_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=all_fieldnames, extrasaction='ignore')
        writer.writeheader()
        writer.writerows(existing_records)
    
    print(f"Successfully added {added_count} new unique papers to the CSV.")
    return added_count

def download_pdfs(records: List[Dict[str, Any]], pdf_dir: Path, max_downloads: int = 50):
    print(f"Attempting to download up to {max_downloads} open-access PDFs...")
    os.makedirs(pdf_dir, exist_ok=True)
    
    headers = {"User-Agent": "Mozilla/5.0"}
    downloaded = 0
    
    for i, r in enumerate(records):
        if downloaded >= max_downloads: break
        pdf_url = r.get("pdf_url")
        if not pdf_url: continue
        
        filename = f"{r.get('year', '2024')} - {re.sub(r'[\\\\/*?:\x22<>|]', '_', r.get('title', 'untitled'))}.pdf"
        out_path = pdf_dir / filename
        
        if out_path.exists():
            downloaded += 1
            print(f"  [{downloaded}] Already exists: {r.get('title')[:60]}")
            continue
            
        try:
            print(f"  [{downloaded+1}] Downloading: {r.get('title')[:60]}...")
            resp = requests.get(pdf_url, headers=headers, timeout=30, stream=True)
            if resp.status_code == 200:
                with open(out_path, "wb") as f:
                    for chunk in resp.iter_content(chunk_size=8192):
                        f.write(chunk)
                downloaded += 1
                print("    -> Success!")
            else:
                print(f"    -> Failed with status {resp.status_code}")
        except Exception as e:
            print(f"    -> Error: {e}")
            
    print(f"\nDownloaded {downloaded} PDFs.")

def dry_run():
    print(f"Targeting label: {TARGET_LABEL}")
    print("Performing deep dry run search...")
    
    all_results = []
    all_titles = set()
    
    for query in QUERY_LIST:
        s2_results = search_semantic_scholar_deep(query, MAX_S2_RESULTS)
        gs_results = []
        if USE_SERPAPI and SERPAPI_API_KEY:
            gs_results = search_google_scholar_deep(query, SERPAPI_API_KEY, MAX_SERPAPI_PAGES)
        
        results = s2_results + gs_results
        
        for r in results:
            title_norm = normalize(r['title'])
            if title_norm not in all_titles:
                all_titles.add(title_norm)
                all_results.append(r)
        
        print(f"  -> Total unique papers so far: {len(all_results)}")
        time.sleep(SLEEP_SECONDS)
    
    return all_results

if __name__ == "__main__":
    import sys
    results = dry_run()
    print(f"\nFinal count of unique results: {len(results)}")
    
    if len(sys.argv) > 1 and sys.argv[1] == "--execute":
        merge_to_csv(results, CSV_PATH)
        download_pdfs(results, PDF_DIR, max_downloads=50)
    else:
        print("\nTo actually add these to the CSV and download PDFs, run with: python3 search_activity_tracing.py --execute")
