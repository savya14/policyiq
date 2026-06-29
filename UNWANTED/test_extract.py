import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), 'backend')))
import pickle
import pathlib

VECTOR_STORE_DIR = pathlib.Path(__file__).resolve().parent / "vector_store"
pkl_path = VECTOR_STORE_DIR / "index.pkl"
with open(pkl_path, "rb") as f:
    docstore_data = pickle.load(f)
docstore = docstore_data[0]
all_docs = list(docstore._dict.values())

# Let's find chunks for OISD STD 144 page 98
found_98 = False
for d in all_docs:
    src = d.metadata.get("source", "").lower()
    p = d.metadata.get("page")
    if "144" in src and str(p) == "98":
        found_98 = True
        print(f"Page 98 found. Preview: {d.page_content[:100]}")

if not found_98:
    print("Page 98 NOT found in index for OISD 144!")
    
# Let's see what's on page 89 to compare
for d in all_docs:
    src = d.metadata.get("source", "").lower()
    p = d.metadata.get("page")
    if "144" in src and str(p) == "89":
        print(f"Page 89 found. Preview: {d.page_content[:100]}")

