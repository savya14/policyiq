from langchain_community.vectorstores import FAISS
from langchain_core.documents import Document
from langchain_huggingface import HuggingFaceEmbeddings

embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2", model_kwargs={"device": "cpu"})
docs = [Document(page_content="test1", metadata={"source": "test1.pdf"}), Document(page_content="test2", metadata={"source": "test2.pdf"})]
vs = FAISS.from_documents(docs, embeddings)

ids_to_delete = []
for idx, doc_id in vs.index_to_docstore_id.items():
    if vs.docstore.search(doc_id).metadata["source"] == "test1.pdf":
        ids_to_delete.append(doc_id)

print("Before:", len(vs.docstore._dict))
vs.delete(ids_to_delete)
print("After:", len(vs.docstore._dict))
print(vs.index_to_docstore_id)
