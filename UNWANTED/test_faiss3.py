from langchain_community.vectorstores import FAISS
from langchain_core.documents import Document
from langchain_huggingface import HuggingFaceEmbeddings

embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2", model_kwargs={"device": "cpu"})

# create and save
docs = [Document(page_content="test1", metadata={"source": "test1.pdf"}), Document(page_content="test2", metadata={"source": "test2.pdf"})]
vs = FAISS.from_documents(docs, embeddings)
vs.save_local("test_faiss_dir")

# load and delete
vs2 = FAISS.load_local("test_faiss_dir", embeddings, allow_dangerous_deserialization=True)
ids = [k for k, v in vs2.docstore._dict.items() if v.metadata["source"] == "test1.pdf"]
vs2.delete(ids)
vs2.save_local("test_faiss_dir")

# load and verify
vs3 = FAISS.load_local("test_faiss_dir", embeddings, allow_dangerous_deserialization=True)
print(len(vs3.docstore._dict))
