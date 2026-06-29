"""
Build Vector Index module for PolicyIQ.

Run this script once locally to parse, chunk, embed, and compile the raw PDF 
documents in `data/raw/` into a local FAISS vector store.

IMPORTANT: Do NOT run this script on Hugging Face Spaces or generic free-tier container deployments. 
Downloading heavy dependencies, OCR engines, and converting large PDFs to images for embedding 
requires intensive compute and will crash or lock up resource-constrained containers. Build the 
index locally and commit/upload the `vector_store/` files to Hugging Face Spaces instead.
"""

import pathlib
import sys
import os
from dotenv import load_dotenv

# Shim pkgutil.find_loader for Python 3.14+ compatibility (used by pytesseract)
import pkgutil
import importlib.util
if not hasattr(pkgutil, "find_loader"):
    def _find_loader(fullname):
        try:
            spec = importlib.util.find_spec(fullname)
            return spec.loader if spec is not None else None
        except Exception:
            return None
    pkgutil.find_loader = _find_loader

# Call load_dotenv() at the very top of the script
load_dotenv()

# Set project root and add it to sys.path to handle module routing correctly
SCRIPT_DIR = pathlib.Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Import indexing pipeline utilities
from indexing.parser import parse_document
from indexing.chunker import chunk_document
from indexing.embedder import get_embedding_model
from indexing.deduplicator import is_already_indexed, mark_as_indexed
from langchain_community.vectorstores import FAISS

# Paths resolved relative to project root
RAW_DATA_DIR = PROJECT_ROOT / "data" / "raw"
VECTOR_STORE_DIR = PROJECT_ROOT / "vector_store"

def main():
    try:
        print("=== PolicyIQ Vector Index Builder ===")
        
        # Ensure directories exist
        RAW_DATA_DIR.mkdir(parents=True, exist_ok=True)
        VECTOR_STORE_DIR.mkdir(parents=True, exist_ok=True)
        
        # 1. Find all .pdf files recursively under RAW_DATA_DIR
        pdf_files = list(RAW_DATA_DIR.rglob("*.pdf"))
        
        # 2. Print total PDFs found
        print(f"Found {len(pdf_files)} PDF file(s) in {RAW_DATA_DIR}")
        
        all_chunks = []
        index_file = VECTOR_STORE_DIR / "index.faiss"
        index_exists = index_file.exists()

        # 3. For each PDF: check registry and index if new
        for pdf_path in pdf_files:
            filename = pdf_path.name
            
            # Use is_already_indexed. If the physical index file doesn't exist,
            # we force re-indexing regardless of the hashes file to ensure integrity.
            if is_already_indexed(str(pdf_path)) and index_exists:
                print(f"SKIPPING {filename} (already indexed)")
                continue
                
            print(f"Processing: {filename}")
            try:
                # parse_document -> chunk_document -> mark_as_indexed
                pages = parse_document(str(pdf_path))
                chunks = chunk_document(pages, str(pdf_path))
                print(f"  -> Extracted {len(pages)} pages into {len(chunks)} chunks.")
                
                all_chunks.extend(chunks)
                
                # Register the file as indexed
                mark_as_indexed(str(pdf_path))
            except Exception as e:
                print(f"  -> ERROR processing {filename}: {e}")


        # 5. If no chunks collected, handle appropriately
        if not all_chunks:
            if not index_exists:
                print(
                    "\nERROR: No document chunks were collected, and no existing FAISS index "
                    "was found. Please place PDF files in 'data/raw/' and run this script.",
                    file=sys.stderr
                )
                sys.exit(1)
            else:
                print("\nAll PDF files are already indexed. FAISS vector store is up to date.")
                return

        # 6. Print total chunk count to be processed
        print(f"\nAdding {len(all_chunks)} chunks to vector index...")

        # 7. Get embedding model
        embeddings = get_embedding_model()

        # 8 & 9. Build or update local FAISS index
        if index_exists:
            print("Existing FAISS index found. Loading and merging new chunks...")
            vectorstore = FAISS.load_local(
                str(VECTOR_STORE_DIR), 
                embeddings, 
                allow_dangerous_deserialization=True
            )
            vectorstore.add_documents(all_chunks)
        else:
            print("Building new FAISS vector index...")
            vectorstore = FAISS.from_documents(all_chunks, embeddings)

        # 10. Save vector store to local disk
        vectorstore.save_local(str(VECTOR_STORE_DIR))
        
        # 11. Success summary
        print("\nIndex built successfully.")
        print(f"Saved artifacts:")
        print(f"  - {VECTOR_STORE_DIR / 'index.faiss'}")
        print(f"  - {VECTOR_STORE_DIR / 'index.pkl'}")

    except Exception as e:
        print(f"\nIndex Build Failed: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
