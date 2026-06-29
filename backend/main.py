"""
PolicyIQ FastAPI application entry point.

load_dotenv() is called first — before any rag/ module imports —
because generator.py reads GROQ_API_KEY on import.

FRONTEND_URL must be set in .env to your Vercel deployment URL for production CORS.
"""

import os
from dotenv import load_dotenv

# Shim pkgutil.find_loader for Python 3.14+ compatibility (used by pytesseract)
import pkgutil
import importlib.util
if not hasattr(pkgutil, "find_loader"):
    def _find_loader(fullname):
        try:
            spec = importlib.util.find_spec(fullname)
            return spec.loader if spec is not None else None
        except Exception:
            return None
    pkgutil.find_loader = _find_loader

# Must be called before any other import that reads env vars
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler
from backend.routers import chat, admin

app = FastAPI(title="PolicyIQ API", version="1.0.0")

app.state.limiter = chat.limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS — allow Vite dev server and production Vercel URL
app_env = os.getenv("APP_ENV", "development")
cors_origins_env = os.getenv("CORS_ORIGINS", "")
origins = [o.strip() for o in cors_origins_env.split(",") if o.strip()]

if app_env != "production":
    origins.extend([
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:3000",
    ])

origins = [o for o in origins if o]  # remove empty strings

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat.router)
app.include_router(admin.router)


@app.get("/")
async def health_check():
    return {"status": "ok", "service": "PolicyIQ API"}


# ── PDF serving ───────────────────────────────────────────────────────────────
import pathlib as _pathlib
from fastapi import HTTPException as _HTTPException
from fastapi.responses import FileResponse as _FileResponse

_PDF_DIRS = [
    _pathlib.Path(__file__).resolve().parent.parent / "data" / "raw",
    _pathlib.Path(__file__).resolve().parent.parent / "data" / "archive",
]

_THUMBNAIL_DIR = _pathlib.Path(__file__).resolve().parent.parent / "data" / "thumbnails"
_THUMBNAIL_DIR.mkdir(parents=True, exist_ok=True)

@app.get("/api/thumbnails/{filename}")
async def serve_thumbnail(filename: str):
    import pypdfium2 as pdfium
    
    thumb_path = _THUMBNAIL_DIR / f"{filename}.jpg"
    if thumb_path.exists():
        return _FileResponse(str(thumb_path), media_type="image/jpeg")
        
    pdf_path = None
    for folder in _PDF_DIRS:
        p = folder / filename
        if p.exists() and p.suffix.lower() == ".pdf":
            pdf_path = p
            break
            
    if not pdf_path:
        raise _HTTPException(status_code=404, detail=f"PDF not found: {filename}")
        
    try:
        pdf = pdfium.PdfDocument(str(pdf_path))
        page = pdf.get_page(0)
        bitmap = page.render(scale=2)
        pil_image = bitmap.to_pil()
        pil_image.save(str(thumb_path), format="JPEG", quality=85)
        pdf.close()
        return _FileResponse(str(thumb_path), media_type="image/jpeg")
    except Exception as e:
        raise _HTTPException(status_code=500, detail=f"Failed to generate thumbnail: {str(e)}")

@app.get("/api/documents/{filename}")
async def serve_pdf(filename: str):
    for folder in _PDF_DIRS:
        path = folder / filename
        if path.exists() and path.suffix.lower() == ".pdf":
            return _FileResponse(
                str(path),
                media_type="application/pdf",
                headers={"Content-Disposition": f"inline; filename={filename}"},
            )
    raise _HTTPException(status_code=404, detail=f"PDF not found: {filename}")
