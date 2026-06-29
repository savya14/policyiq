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

def get_true_standard(file_path):
    try:
        with pdfplumber.open(file_path) as pdf:
            if not pdf.pages:
                return "EMPTY", "No pages"
            # Read first page
            text = pdf.pages[0].extract_text() or ""
            # Search for OISD, PESO, PNGRB standard name/number in text
            oisd_match = re.search(r"OISD[-_ ]STANDARD[-_ ](\d+)|OISD[-_ ]मानक[-_ ](\d+)|मानक[-_ ](\d+)", text, re.I)
            if oisd_match:
                num = next(g for g in oisd_match.groups() if g is not None)
                return f"OISD-{num}", text[:100].replace('\n', ' ')
            
            # Check for standard in text generally
            standard_match = re.search(r"(OISD|PESO|PNGRB)[-_ ](STD|STANDARD|RULES|REGULATIONS|GDN)?[-_ ]?(\d+)", text, re.I)
            if standard_match:
                return f"{standard_match.group(1).upper()}-{standard_match.group(3)}", text[:100].replace('\n', ' ')
                
            return "UNKNOWN", text[:100].replace('\n', ' ')
    except Exception as e:
        return "ERROR", str(e)

def main():
    print("Scanning data/raw...")
    raw_files = list((PROJECT_ROOT / "data" / "raw").glob("*.pdf"))
    archive_files = list((PROJECT_ROOT / "data" / "archive").glob("*.pdf"))
    
    print(f"Found {len(raw_files)} files in data/raw and {len(archive_files)} in data/archive")
    
    print("\n--- data/raw ---")
    for f in sorted(raw_files):
        true_std, head = get_true_standard(f)
        h = compute_sha256(f)
        print(f"File: {f.name}\n  Size: {f.stat().st_size} bytes\n  True Std: {true_std}\n  Hash: {h}\n  Header: {head}\n")
        
    print("\n--- data/archive ---")
    for f in sorted(archive_files):
        true_std, head = get_true_standard(f)
        h = compute_sha256(f)
        print(f"File: {f.name}\n  Size: {f.stat().st_size} bytes\n  True Std: {true_std}\n  Hash: {h}\n  Header: {head}\n")

if __name__ == "__main__":
    main()
