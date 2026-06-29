import os
import re
import hashlib
import sys
from pathlib import Path
import pdfplumber

PROJECT_ROOT = Path("/Users/savyaraj/Desktop/policyiq")

def compute_sha256(file_path):
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()

def get_pdf_metadata(file_path):
    try:
        with pdfplumber.open(file_path) as pdf:
            page_count = len(pdf.pages)
            if page_count == 0:
                return "EMPTY", 0, ""
            
            # Read first few pages to find standard number
            text = ""
            for i in range(min(3, page_count)):
                text += pdf.pages[i].extract_text() or ""
            
            # Look for OISD standard number
            oisd_match = re.search(r"OISD[-_ ](?:STD|STANDARD|मानक)[-_ ]?(\d+)", text, re.I)
            if oisd_match:
                return f"OISD-{oisd_match.group(1)}", page_count, text[:200].replace('\n', ' ')
            
            # Look for PNGRB standard
            pngrb_match = re.search(r"PNGRB[-_ ](?:STD|STANDARD|REGULATIONS|RULES|GDN)?[-_ ]?(\d+)", text, re.I)
            if pngrb_match:
                return f"PNGRB-{pngrb_match.group(1)}", page_count, text[:200].replace('\n', ' ')
            
            # Look for PESO standard
            peso_match = re.search(r"PESO[-_ ](?:STD|STANDARD|REGULATIONS|RULES|GDN)?[-_ ]?(\d+)", text, re.I)
            if peso_match:
                return f"PESO-{peso_match.group(1)}", page_count, text[:200].replace('\n', ' ')
            
            # Look for general OISD, PESO, PNGRB in filename
            fn = file_path.name.lower()
            fn_match = re.search(r"(oisd|peso|pngrb)[-_]?(std|gdn|rules)?[-_]?(\d+)", fn, re.I)
            if fn_match:
                return f"{fn_match.group(1).upper()}-{fn_match.group(3)}", page_count, "[From Filename] " + text[:150].replace('\n', ' ')
                
            return "UNKNOWN", page_count, text[:200].replace('\n', ' ')
    except Exception as e:
        return f"ERROR: {str(e)}", 0, ""

def main():
    all_files = list((PROJECT_ROOT / "data" / "raw").glob("*.pdf")) + list((PROJECT_ROOT / "data" / "archive").glob("*.pdf"))
    
    # Group by true standard key
    groups = {}
    for f in all_files:
        std_key, pages, text = get_pdf_metadata(f)
        h = compute_sha256(f)
        is_in_raw = "raw" in f.parts
        record = {
            "path": f,
            "filename": f.name,
            "size": f.stat().st_size,
            "pages": pages,
            "hash": h,
            "is_in_raw": is_in_raw,
            "first_text": text
        }
        groups.setdefault(std_key, []).append(record)
        
    print(f"=== Standard Group Analysis ({len(all_files)} total files) ===")
    for std_key, file_records in sorted(groups.items()):
        print(f"\nGroup: {std_key}")
        for r in file_records:
            status = "RAW" if r["is_in_raw"] else "ARCHIVE"
            print(f"  [{status}] {r['filename']}")
            print(f"    Hash: {r['hash']}")
            print(f"    Size: {r['size']} bytes, Pages: {r['pages']}")
            print(f"    Snippet: {r['first_text'][:120]}")

if __name__ == "__main__":
    main()
