import csv
import re

csv_path = 'paper_search_results.csv'
label_to_review = 'Keyword-26Mar18'

def normalize(text):
    if not text: return ""
    return text.lower().strip()

def classify(title, abstract):
    blob = normalize(title + " " + abstract)
    
    # Positive patterns for tracing/tracking
    trace_patterns = [
        r"track", r"trace", r"tracing", r"movement", r"activity", r"interaction", 
        r"behavior", r"sequence", r"workflow", r"temporal", r"spatial patterns"
    ]
    viz_patterns = [
        r"visualization", r"visual analysis", r"visual analytics", r"diagram", r"chart", r"map"
    ]
    
    has_viz = any(re.search(p, blob) for p in viz_patterns)
    has_trace = any(re.search(p, blob) for p in trace_patterns)
    
    if has_viz and has_trace:
        # Check for explicit tracing/tracking/mapping
        if any(re.search(p, blob) for p in [r"track", r"trace", r"movement", r"sequence", r"mapping"]):
            return "included"
        return "maybe"
    elif has_viz or has_trace:
        return "maybe"
    else:
        return "excluded"

rows = []
with open(csv_path, 'r', encoding='utf-8-sig') as f:
    reader = csv.DictReader(f)
    fieldnames = reader.fieldnames
    for row in reader:
        if row.get('label') == label_to_review:
            # Re-classify
            status = classify(row.get('title', ''), row.get('abstract', ''))
            row['include_guess'] = status
        rows.append(row)

with open(csv_path, 'w', encoding='utf-8-sig', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)

print(f"Updated inclusion status for {label_to_review} papers.")
