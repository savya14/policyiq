from pydantic import BaseModel, Field
from typing import Optional, List, Union


# ── Chat ──────────────────────────────────────────────────────────────────────

class SourceDocument(BaseModel):
    """A single retrieved chunk returned alongside an answer."""
    source: str                      # filename, e.g. "06_OISD-STD-144_LPG_Installations.pdf"
    section: Optional[str] = None   # legacy: human-readable category + chunk label
    page: Optional[str] = None      # legacy: chunk index as string
    category: Optional[str] = None
    page_number: Optional[str] = None
    section_title: Optional[str] = None
    chunk_index: Optional[int] = None
    preview: Optional[str] = None   # first ~200 chars of chunk text
    score: Optional[float] = None   # relevance score



class AskRequest(BaseModel):
    question: str
    session_id: Optional[str] = Field(
        default=None,
        description=(
            "Session ID for conversation memory. "
            "Omit to start a new session — one will be created and returned."
        ),
    )
    chat_history: List[dict] = Field(default_factory=list)
    language: str = "en"

class AskResponse(BaseModel):
    answer: Optional[str] = None
    session_id: str
    source_documents: List[SourceDocument] = []
    is_in_scope: bool = True
    rate_limited: bool = False
    blocked: bool = False
    block_reason: Optional[str] = ""


# ── Admin / Auth ───────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    password: str

class LoginResponse(BaseModel):
    token: str


# ── Documents ─────────────────────────────────────────────────────────────────

class DocumentMeta(BaseModel):
    filename: str
    chunks: int

class DocumentsResponse(BaseModel):
    documents: List[DocumentMeta] = []

class UploadResponse(BaseModel):
    success: bool
    message: str

class DeleteResponse(BaseModel):
    success: bool
    message: str

# ── Feedback ──────────────────────────────────────────────────────────────────

class FeedbackRequest(BaseModel):
    query: str
    response: str
    sources: List[dict]
    is_positive: bool

class FeedbackResponse(BaseModel):
    success: bool

class FeedbackItem(BaseModel):
    timestamp: str
    query: str
    response: str
    sources: List[dict]
    is_positive: bool

class FeedbackListResponse(BaseModel):
    feedbacks: List[FeedbackItem]

