import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), 'backend')))
from rag.pipeline import _handle_summarize_page

try:
    res = _handle_summarize_page("summarize page number 2 of PESO Petroleum Rules 2002", "test", "en")
    print(f"Success! Answer: {res['answer'][:100]}")
except Exception as e:
    print(f"Failed: {e}")
