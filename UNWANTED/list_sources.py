import sys
import os
import pickle
import pathlib

VECTOR_STORE_DIR = pathlib.Path(__file__).resolve().parent / "vector_store"
pkl_path = VECTOR_STORE_DIR / "index.pkl"
with open(pkl_path, "rb") as f:
    docstore_data = pickle.load(f)
docstore = docstore_data[0]
all_docs = list(docstore._dict.values())
sources = set(d.metadata.get("source") for d in all_docs)
for s in sources:
    print(s)
