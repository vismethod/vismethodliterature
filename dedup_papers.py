import os
import re
import shutil

papers_dir = '/Users/zezhongwang/Downloads/VIS-Method/papers'

files = [f for f in os.listdir(papers_dir) if f.endswith('.pdf')]

def normalize_name(name):
    # Remove year if present to find matching papers
    name = re.sub(r'^\d{4}\s*-\s*', '', name)
    name = re.sub(r'[^a-zA-Z0-9]', '', name).lower()
    name = name.replace('pdf', '')
    return name

groups = {}
for f in files:
    norm = normalize_name(f)
    if norm not in groups:
        groups[norm] = []
    groups[norm].append(f)

removed_count = 0
for norm, group in groups.items():
    if len(group) > 1:
        # Prefer names that begin with our standardized 'YYYY - ' format
        preferred_name = None
        for f in group:
            if re.match(r'^\d{4}\s*-', f):
                preferred_name = f
                break
        if not preferred_name:
            preferred_name = max(group, key=len)
            
        group_with_sizes = [(f, os.path.getsize(os.path.join(papers_dir, f))) for f in group]
        largest_file, largest_size = max(group_with_sizes, key=lambda x: x[1])
        
        preferred_path = os.path.join(papers_dir, preferred_name)
        largest_path = os.path.join(papers_dir, largest_file)
        
        # If the largest file isn't the preferred name, preserve its content
        if largest_file != preferred_name:
            print(f"Group match found:")
            print(f"  -> Largest content is {largest_file} ({largest_size} bytes)")
            print(f"  -> Merging content to standard name {preferred_name}")
            shutil.copy2(largest_path, preferred_path)
            
        # Delete the non-preferred files
        for f, size in group_with_sizes:
            if f != preferred_name:
                print(f"  -> Deleting duplicate: {f} ({size} bytes)")
                os.remove(os.path.join(papers_dir, f))
                removed_count += 1

print(f"\nRemoved {removed_count} duplicate overarching files.")
