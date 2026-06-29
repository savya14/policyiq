import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), 'backend')))
from rag.retriever import get_retriever

retriever = get_retriever(k=3)
topics = [
    "fire water tank inspection",
    "distance LPG cylinder",
    "pump maintenance frequency",
    "earthing test frequency",
    "pipeline patrol",
    "hot work permit validity"
]

for t in topics:
    docs = retriever.vectorstore.similarity_search_with_relevance_scores(t, k=1)
    if docs:
        doc, score = docs[0]
        print(f"Topic: {t}")
        print(f"Content: {doc.page_content[:400]}")
        print("-" * 50)
