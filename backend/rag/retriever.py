"""
retriever.py — PolicyIQ FAISS retriever

Loads the FAISS index once and caches it. SanitizingRetriever wraps the
underlying FAISS retriever to:
  - inject relevance scores into chunk metadata
  - run targeted follow-up queries for PESO/PNGRB when the main search misses them
  - deduplicate and normalise metadata before returning docs to the chain
"""
import os
import functools
import pathlib

from langchain_community.vectorstores import FAISS
from langchain_core.callbacks import CallbackManagerForRetrieverRun
from langchain_core.documents import Document
from langchain_core.retrievers import BaseRetriever
from langchain_huggingface import HuggingFaceEmbeddings

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
RERANK_MODEL = "cross-encoder/ms-marco-MiniLM-L-6-v2"

PROJECT_ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
VECTOR_STORE_DIR = PROJECT_ROOT / "vector_store"

@functools.lru_cache(maxsize=1)
def _load_cross_encoder():
    from sentence_transformers import CrossEncoder
    return CrossEncoder(RERANK_MODEL, device="cpu")


@functools.lru_cache(maxsize=1)
def _load_vectorstore() -> FAISS:
    """Load and cache the FAISS index from disk."""
    index_path = VECTOR_STORE_DIR / "index.faiss"
    if not index_path.exists():
        raise FileNotFoundError(
            f"FAISS index not found at {VECTOR_STORE_DIR}. "
            "Run indexing/build_index.py to build the vector store."
        )
    print(f"[Retriever] Loading FAISS index from {VECTOR_STORE_DIR}...")
    embeddings = HuggingFaceEmbeddings(
        model_name=MODEL_NAME,
        model_kwargs={"device": "cpu"},
    )
    vs = FAISS.load_local(
        str(VECTOR_STORE_DIR),
        embeddings,
        allow_dangerous_deserialization=True,
    )
    print("[Retriever] FAISS index loaded successfully.")
    return vs


def _search_with_scores(vs: FAISS, query: str, k: int) -> list[Document]:
    """
    Run similarity_search_with_relevance_scores and return Documents with
    the score injected into metadata. Clones metadata to avoid mutating cache.
    """
    docs: list[Document] = []
    for doc, score in vs.similarity_search_with_relevance_scores(query, k=k):
        meta = doc.metadata.copy()
        meta["score"] = score
        docs.append(Document(page_content=doc.page_content, metadata=meta))
    return docs


class SanitizingRetriever(BaseRetriever):
    """
    Wraps a FAISS VectorStoreRetriever to:
      1. Attach relevance scores to each retrieved chunk.
      2. Run targeted follow-up queries when PESO/PNGRB docs are absent from
         the main results (query expansion for multi-standard comparisons).
      3. Deduplicate and normalise metadata fields before returning.
    """

    underlying_retriever: BaseRetriever

    class Config:
        arbitrary_types_allowed = True

    @property
    def vectorstore(self) -> FAISS | None:
        return getattr(self.underlying_retriever, "vectorstore", None)

    def _get_relevant_documents(
        self,
        query: str,
        *,
        run_manager: CallbackManagerForRetrieverRun | None = None,
    ) -> list[Document]:
        vs = self.vectorstore  # resolved once; no shadowing below
        k = self.underlying_retriever.search_kwargs.get("k", 5)

        docs: list[Document] = []
        try:
            if vs is not None:
                docs = _search_with_scores(vs, query, k)
            else:
                raw = self.underlying_retriever.get_relevant_documents(
                    query,
                    callbacks=run_manager.get_child() if run_manager else None,
                )
                docs = [
                    Document(
                        page_content=d.page_content,
                        metadata={**d.metadata.copy(), "score": 0.8},
                    )
                    for d in raw
                ]
        except Exception:
            raw = self.underlying_retriever.get_relevant_documents(
                query,
                callbacks=run_manager.get_child() if run_manager else None,
            )
            docs = [
                Document(
                    page_content=d.page_content,
                    metadata={**d.metadata.copy(), "score": 0.8},
                )
                for d in raw
            ]

        docs = self._expand_for_regulators(query, docs, vs, run_manager, k)
        docs = self._deduplicate_and_sanitize(docs)

        if os.getenv("RERANK_ENABLED", "").lower() == "true":
            try:
                reranker = _load_cross_encoder()
                pairs = [(query, doc.page_content) for doc in docs]
                scores = reranker.predict(pairs)
                
                for doc, score in zip(docs, scores):
                    doc.metadata["rerank_score"] = float(score)
                
                # Sort descending by rerank score
                docs = sorted(docs, key=lambda d: d.metadata.get("rerank_score", 0.0), reverse=True)
                # Keep top-k
                docs = docs[:k]
            except Exception as e:
                print(f"[Retriever] Reranking failed: {e}")

        return docs

    def _expand_for_regulators(
        self,
        query: str,
        docs: list[Document],
        vs: FAISS | None,
        run_manager,
        k: int,
    ) -> list[Document]:
        query_lower = query.lower()
        extra_queries: list[str] = []

        if "peso" in query_lower:
            has_peso = any(
                "peso" in d.metadata.get("source", "").lower() for d in docs
            )
            if not has_peso:
                if "cylinder" in query_lower or "storage" in query_lower:
                    extra_queries.append("PESO cylinder storage")
                if "petroleum" in query_lower:
                    extra_queries.append("PESO petroleum rules")
                if "explosive" in query_lower:
                    extra_queries.append("PESO explosives rules")
                if "smpv" in query_lower or "pressure vessel" in query_lower or "unfired" in query_lower:
                    extra_queries.append("PESO SMPV rules")
                if not extra_queries:
                    extra_queries.append("PESO safety regulations")

        if "pngrb" in query_lower:
            has_pngrb = any(
                "pngrb" in d.metadata.get("source", "").lower() for d in docs
            )
            if not has_pngrb:
                if "pipeline" in query_lower:
                    extra_queries.append("PNGRB pipeline safety")
                if "erdmp" in query_lower or "emergency" in query_lower:
                    extra_queries.append("PNGRB ERDMP regulations")
                if not extra_queries:
                    extra_queries.append("PNGRB regulations")

        for eq in extra_queries:
            try:
                if vs is not None:
                    docs.extend(_search_with_scores(vs, eq, k=2))
                else:
                    raw = self.underlying_retriever.get_relevant_documents(
                        eq,
                        callbacks=run_manager.get_child() if run_manager else None,
                    )
                    docs.extend(
                        Document(
                            page_content=d.page_content,
                            metadata={**d.metadata.copy(), "score": 0.7},
                        )
                        for d in raw[:2]
                    )
            except Exception:
                pass

        return docs

    @staticmethod
    def _deduplicate_and_sanitize(docs: list[Document]) -> list[Document]:
        seen: set[tuple] = set()
        result: list[Document] = []

        for doc in docs:
            src = doc.metadata.get("source", "unknown")
            page = doc.metadata.get("page", "unknown")
            key = (src, str(page), doc.page_content[:50].strip())
            if key in seen:
                continue
            seen.add(key)

            meta = doc.metadata.copy()
            meta.setdefault("source", "unknown")
            meta.setdefault("category", "general")
            meta.setdefault("chunk_index", 0)
            meta.setdefault("section", "General")
            meta["page"] = str(meta.get("page", "unknown"))

            result.append(Document(page_content=doc.page_content, metadata=meta))

        # Sort deterministically by (source, page) so the LLM always sees
        # context chunks in the same order for the same query.
        def _sort_key(d: Document):
            src = d.metadata.get("source", "")
            try:
                pg = int(d.metadata.get("page", "0"))
            except (ValueError, TypeError):
                pg = 0
            return (src, pg)

        result.sort(key=_sort_key)
        return result


def get_retriever(k: int = 5) -> SanitizingRetriever:
    """Return a cached SanitizingRetriever for the top-k most relevant chunks."""
    vs = _load_vectorstore()
    raw_retriever = vs.as_retriever(
        search_type="similarity",
        search_kwargs={"k": k},
    )
    return SanitizingRetriever(underlying_retriever=raw_retriever)
