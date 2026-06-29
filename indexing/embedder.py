"""
Embedder module for PolicyIQ.

Model Choice: sentence-transformers/all-MiniLM-L6-v2
This module configures the vector representation model for PolicyIQ. We use the 
'all-MiniLM-L6-v2' model from SentenceTransformers for the following reasons:
1. Lightweight and Resource-Efficient: At only ~80MB, this model can run locally on 
   modest hardware (CPU) without high memory overhead.
2. High Speed: It offers rapid inference speeds for text embedding generation compared to 
   larger models (like BGE or Cohere).
3. Cost and Offline Capability: It runs entirely locally, ensuring zero API costs, zero 
   network latency during retrieval, and complete offline capability (except for the 
   first-time download).
4. Competence in Technical English: It has proven utility in standard enterprise search 
   tasks, capturing semantic similarity of technical terms, distances, and compliance 
   clauses found in OISD/PESO guidelines.
"""

from langchain_huggingface import HuggingFaceEmbeddings

# Pinned sentence-transformer model name
MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"

def get_embedding_model() -> HuggingFaceEmbeddings:
    """
    Initializes and returns the HuggingFaceEmbeddings client.
    
    Prints a download notice warning the user that the first execution 
    requires downloading the ~80MB model which can take up to 2 minutes.
    """
    print(
        f"\n[Embedder] Initializing model '{MODEL_NAME}' on CPU..."
    )
    print(
        "[Embedder] NOTE: If this is the first run, the model will download to "
        "your local HuggingFace cache (~/.cache/huggingface). "
        "This initial download may take up to 1-2 minutes depending on connection speeds."
    )
    
    # Initialize the model on CPU
    embeddings = HuggingFaceEmbeddings(
        model_name=MODEL_NAME,
        model_kwargs={"device": "cpu"}
    )
    
    print("[Embedder] Model successfully initialized.")
    return embeddings

if __name__ == "__main__":
    print("--- Testing Embedder Initialization and Inference ---")
    try:
        model = get_embedding_model()
        test_sentence = "fire safety minimum distance LPG storage"
        
        # Perform query embedding test
        vector = model.embed_query(test_sentence)
        
        print("\nTest Ingestion Successful!")
        print(f"Input text: '{test_sentence}'")
        print(f"Embedding vector length (dimensions): {len(vector)}")
        print(f"Sample values (first 5 elements): {vector[:5]}")
        
    except Exception as e:
        print(f"\nFailed to initialize or run embedding model: {e}")
