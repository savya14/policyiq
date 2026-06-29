"""
Parser module for PolicyIQ.

This module handles the ingestion and parsing of PDF documents. It supports:
1. Detecting whether a PDF is digital (vector) or scanned (image-only) by checking the first few pages.
2. Extracting text page-by-page from digital PDFs using pdfplumber.
3. Extracting text page-by-page from scanned PDFs using pytesseract (OCR) after converting PDF pages to images.

Each page is parsed into a dictionary structure containing the extracted text and metadata:
{
    "text": str,
    "metadata": {
        "source": str,  # filename without extension
        "page": int     # 1-indexed page number
    }
}
"""

import os
import pathlib
import shutil
import pdfplumber
import pytesseract
from pdf2image import convert_from_path

def is_scanned(pdf_path: str) -> bool:
    """
    Checks the first 3 pages of a PDF to determine if it is scanned.
    Returns True if the average extracted text length per page is under 100 characters.
    """
    path = pathlib.Path(pdf_path)
    if not path.exists():
        raise FileNotFoundError(f"PDF file not found at: {pdf_path}")

    with pdfplumber.open(path) as pdf:
        pages_to_check = pdf.pages[:3]
        if not pages_to_check:
            return True  # Treat empty documents as scanned/needing OCR check

        total_char_count = 0
        for page in pages_to_check:
            text = page.extract_text() or ""
            total_char_count += len(text.strip())
        
        avg_char_count = total_char_count / len(pages_to_check)
        return avg_char_count < 100

def parse_digital(pdf_path: str) -> list[dict]:
    """
    Parses a digitally native (vector) PDF page-by-page using pdfplumber.
    """
    path = pathlib.Path(pdf_path)
    if not path.exists():
        raise FileNotFoundError(f"PDF file not found at: {pdf_path}")

    source_name = path.stem
    parsed_pages = []

    with pdfplumber.open(path) as pdf:
        for idx, page in enumerate(pdf.pages, start=1):
            text = page.extract_text() or ""
            parsed_pages.append({
                "text": text,
                "metadata": {
                    "source": source_name,
                    "page": idx
                }
            })
    return parsed_pages

def parse_scanned(pdf_path: str) -> list[dict]:
    """
    Parses a scanned PDF page-by-page using pdf2image and pytesseract OCR.
    """
    path = pathlib.Path(pdf_path)
    if not path.exists():
        raise FileNotFoundError(f"PDF file not found at: {pdf_path}")

    source_name = path.stem

    # Include this line for Tesseract path on Linux/HF Spaces:
    pytesseract.pytesseract.tesseract_cmd = '/usr/bin/tesseract'

    # Fallback to system PATH if the HF Spaces path doesn't exist (e.g. on macOS development machine)
    if not os.path.exists(pytesseract.pytesseract.tesseract_cmd):
        system_tesseract = shutil.which("tesseract")
        if system_tesseract:
            pytesseract.pytesseract.tesseract_cmd = system_tesseract

    # Wrap in try/except to verify the Tesseract binary is actually found and operational
    try:
        pytesseract.get_tesseract_version()
    except Exception as e:
        raise RuntimeError(
            "Tesseract OCR binary not found or not operational. "
            "Please ensure Tesseract is installed and added to your system PATH. "
            f"Details: {e}"
        ) from e

    try:
        # Convert all PDF pages to PIL images (300 DPI for high-quality OCR)
        images = convert_from_path(str(path), dpi=300)
    except Exception as e:
        raise RuntimeError(f"Failed to convert scanned PDF to images using pdf2image: {e}") from e

    parsed_pages = []
    for idx, img in enumerate(images, start=1):
        try:
            text = pytesseract.image_to_string(img) or ""
            parsed_pages.append({
                "text": text,
                "metadata": {
                    "source": source_name,
                    "page": idx
                }
            })
        except Exception as e:
            raise RuntimeError(f"Failed to perform OCR on page {idx} of {source_name}: {e}") from e

    return parsed_pages

def parse_document(pdf_path: str) -> list[dict]:
    """
    Routes a PDF document to either digital or scanned parser depending on its text content.
    """
    path = pathlib.Path(pdf_path)
    if is_scanned(str(path)):
        print(f"[{path.name}] Detected scanned PDF. Routing to parse_scanned (OCR)...")
        return parse_scanned(str(path))
    else:
        print(f"[{path.name}] Detected digital PDF. Routing to parse_digital...")
        return parse_digital(str(path))

if __name__ == "__main__":
    # Determine search directory: policyiq/data/raw
    script_dir = pathlib.Path(__file__).resolve().parent
    project_root = script_dir.parent
    raw_dir = project_root / "data" / "raw"

    print(f"Recursively searching for PDF files in: {raw_dir}")
    if not raw_dir.exists():
        print(f"Directory {raw_dir} does not exist. Creating it now...")
        raw_dir.mkdir(parents=True, exist_ok=True)

    pdf_files = list(raw_dir.rglob("*.pdf"))
    if not pdf_files:
        print("No PDF files found to parse.")
    else:
        for pdf_file in pdf_files:
            print("-" * 50)
            print(f"Processing: {pdf_file.relative_to(project_root)}")
            try:
                pages = parse_document(str(pdf_file))
                print(f"Successfully parsed {len(pages)} pages.")
                if pages:
                    preview_text = pages[0]["text"].strip()
                    print(f"--- First Page Preview (First 300 chars) ---")
                    print(preview_text[:300])
                    print("-" * 45)
            except Exception as e:
                print(f"Error processing {pdf_file.name}: {e}")
