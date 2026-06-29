from langchain_community.vectorstores import FAISS
from langchain_core.documents import Document
from langchain_huggingface import HuggingFaceEmbeddings

embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2", model_kwargs={"device": "cpu"})
docs = [Document(page_content="test1", metadata={"source": "test1.pdf"}), Document(page_content="test2", metadata={"source": "test2.pdf"})]
vs = FAISS.from_documents(docs, embeddings)

print("delete" in dir(vs))
