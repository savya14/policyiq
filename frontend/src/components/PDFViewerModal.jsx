import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const pdfOptions = {
  standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/standard_fonts/`,
};

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// ─────────────────────────────────────────────────────────────────────────────
// TEXT NORMALIZATION
// Expand Unicode ligatures BEFORE stripping — PDF.js renders fi/fl/ff/ffi/ffl
// as single ligature codepoints, which norm() would silently drop, creating
// invisible gaps in the concatenated page text and killing substring matching.
// ─────────────────────────────────────────────────────────────────────────────
function expandLigatures(str) {
  if (!str) return '';
  return str
    .replace(/\uFB00/g, 'ff')
    .replace(/\uFB01/g, 'fi')
    .replace(/\uFB02/g, 'fl')
    .replace(/\uFB03/g, 'ffi')
    .replace(/\uFB04/g, 'ffl')
    .replace(/\uFB05/g, 'st')
    .replace(/\uFB06/g, 'st')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"');
}

/**
 * Normalize text to a compact lowercase alphanumeric+hyphen string.
 * Hyphens are preserved because clause IDs like "OISD-STD-144" and
 * technical terms like "non-flammable" depend on them for uniqueness.
 */
function norm(str) {
  if (!str) return '';
  return expandLigatures(str)
    .toLowerCase()
    .replace(/([a-z0-9])-([a-z0-9])/g, '$1\x00$2')
    .replace(/[^a-z0-9\x00]/g, ' ')
    .replace(/\x00/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Compact form: remove ALL whitespace and hyphens for positional matching.
 */
function compact(str) {
  return norm(str).replace(/[\s-]/g, '');
}

// ─────────────────────────────────────────────────────────────────────────────
// WATERMARK DETECTION
// ─────────────────────────────────────────────────────────────────────────────
function isWatermarkSpan(span, medianFontSizePx) {
  const transform = span.style.transform || '';
  const matrixMatch = transform.match(/matrix\(([^)]+)\)/);
  if (matrixMatch) {
    const parts = matrixMatch[1].split(',').map(s => parseFloat(s.trim()));
    if (parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
      const [a, b] = parts;
      let angleDeg = Math.atan2(b, a) * (180 / Math.PI);
      angleDeg = ((angleDeg % 180) + 180) % 180;
      const rotationDeviation = Math.min(angleDeg, 180 - angleDeg);
      if (rotationDeviation > 8) return true;
    }
  }
  if (medianFontSizePx > 0) {
    const fontMatch = (span.style.fontSize || '').match(/([\d.]+)px/);
    if (fontMatch) {
      const fontSizePx = parseFloat(fontMatch[1]);
      const text = (span.textContent || '').trim();
      if (fontSizePx > medianFontSizePx * 2.2 && text.length > 0 && text.length <= 24) return true;
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLAUSE EXTRACTION
// ─────────────────────────────────────────────────────────────────────────────
const STOP_WORDS = new Set([
  'the', 'and', 'is', 'to', 'a', 'in', 'for', 'shall', 'be', 'of', 'with', 'as',
  'per', 'on', 'at', 'its', 'by', 'an', 'or', 'are', 'this', 'that', 'it', 'from',
  'which', 'where', 'when', 'all', 'any', 'not', 'no', 'if', 'each', 'such', 'been',
  'has', 'have', 'was', 'were', 'will', 'may', 'can', 'into', 'than', 'but', 'also',
  'their', 'they', 'these', 'those', 'about', 'above', 'after', 'before',
]);

function tokenize(text) {
  return expandLigatures(text)
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

function isBoilerplateLine(line) {
  if (/^\s*oisd\s*[-–]?\s*(std|rp|gdn)\s*[-–]?\s*\d+/i.test(line)) return true;
  if (/^\s*page\s*(no\.?\s*)?\d+/i.test(line)) return true;
  if (/^\s*(oil industry safety directorate|peso|pngrb|mopng|ministry of)/i.test(line)) return true;
  const alpha = line.replace(/[^A-Za-z]/g, '');
  const upper = line.replace(/[^A-Z]/g, '');
  if (alpha.length > 3 && alpha.length < 80 && upper.length / alpha.length > 0.85) return true;
  return false;
}

function getBestClause(chunkText, answerText) {
  if (!chunkText) return '';

  const bodyLines = chunkText
    .split(/\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0 && !isBoilerplateLine(l));

  const cleanedText = bodyLines.join(' ');
  const fullNorm = norm(cleanedText);

  if (fullNorm.length <= 500) return fullNorm;

  const ansTokens = answerText ? new Set(tokenize(answerText)) : new Set();

  const sentences = cleanedText
    .split(/(?<=[.;!?\n])\s+|(?<=\n)/)
    .map(s => s.trim())
    .filter(s => s.length > 15);

  if (sentences.length <= 1) return fullNorm;

  let bestScore = -1;
  let bestIdx = 0;

  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    const words = tokenize(s);
    let score = 0;
    for (const w of words) {
      if (ansTokens.has(w)) score += 2;
    }
    if (/\b\d+\.\d+(\.\d+)?/.test(s)) score += 4;
    if (/\b(clause|section|table|annex|appendix|fig)\b/i.test(s)) score += 3;
    const numericMatches = s.match(/\b\d+(\.\d+)?\s*(mm|cm|m|kg|kpa|mpa|bar|°c|lpm|kw|kv|hz|%)\b/gi);
    if (numericMatches) score += numericMatches.length * 2;
    if (score > bestScore) { bestScore = score; bestIdx = i; }
  }

  const start = Math.max(0, bestIdx - 1);
  const end = Math.min(sentences.length, bestIdx + 3);
  return norm(sentences.slice(start, end).join(' '));
}

// ─────────────────────────────────────────────────────────────────────────────
// N-GRAM JACCARD SIMILARITY
// ─────────────────────────────────────────────────────────────────────────────
function ngramSet(str, n = 3) {
  const s = str.replace(/\s/g, '');
  const set = new Set();
  for (let i = 0; i <= s.length - n; i++) set.add(s.substring(i, i + n));
  return set;
}

function jaccardSimilarity(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const g of setA) { if (setB.has(g)) intersection++; }
  return intersection / (setA.size + setB.size - intersection);
}

// ─────────────────────────────────────────────────────────────────────────────
// WORD-TOKEN SPAN MAPPING
//
// CRITICAL ordering rule:
//   wordMap.push() MUST happen BEFORE the char loop that writes charToWordIdx.
//   If push() comes after, every charToWordIdx[ci] = wordMap.length points to
//   a slot that doesn't exist yet → wordMap[charToWordIdx[ci]] is always
//   undefined → matchedSpans is always empty → nothing highlights.
// ─────────────────────────────────────────────────────────────────────────────
function buildWordTokenMap(spans, medianFontSizePx) {
  const wordMap = [];
  let pageCompact = '';
  const charToWordIdx = [];

  for (const span of spans) {
    if (isWatermarkSpan(span, medianFontSizePx)) continue;

    const raw = expandLigatures(span.textContent || '');
    const spanNorm = raw.toLowerCase().replace(/[^a-z0-9-]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!spanNorm) continue;

    const spanCompact = spanNorm.replace(/[\s-]/g, '');
    if (!spanCompact) continue;

    // Push to wordMap FIRST — index must exist before charToWordIdx references it
    const wordIdx = wordMap.length;
    const startIdx = pageCompact.length;
    wordMap.push({ span, startIdx, endIdx: -1 });

    for (let ci = 0; ci < spanCompact.length; ci++) {
      charToWordIdx.push(wordIdx);
      pageCompact += spanCompact[ci];
    }

    wordMap[wordIdx].endIdx = pageCompact.length - 1;
  }

  return { wordMap, pageCompact, charToWordIdx };
}

// ─────────────────────────────────────────────────────────────────────────────
// HIGHLIGHT ENGINE — 5-strategy cascade
// ─────────────────────────────────────────────────────────────────────────────
function findMatchSpans(searchKey, wordMap, pageCompact, charToWordIdx) {
  const searchCompact = compact(searchKey);
  if (searchCompact.length < 6) return new Set();

  let startIdx = -1;
  let endIdx = -1;

  // Strategy 1: Full exact substring
  const fullIdx = pageCompact.indexOf(searchCompact);
  if (fullIdx >= 0) {
    startIdx = fullIdx;
    endIdx = fullIdx + searchCompact.length - 1;
  }

  // Strategy 2: Prefix match (60→8 chars, step 4)
  if (startIdx < 0) {
    for (let len = Math.min(60, searchCompact.length); len >= 8; len -= 4) {
      const idx = pageCompact.indexOf(searchCompact.substring(0, len));
      if (idx >= 0) { startIdx = idx; break; }
    }
  }

  // Strategy 3: Suffix match anchored after prefix
  if (startIdx >= 0 && endIdx < 0) {
    for (let len = Math.min(60, searchCompact.length); len >= 8; len -= 4) {
      const suffix = searchCompact.substring(searchCompact.length - len);
      const idx = pageCompact.indexOf(suffix, Math.max(0, startIdx));
      if (idx >= 0) { endIdx = idx + len - 1; break; }
    }
    if (endIdx < 0) endIdx = Math.min(startIdx + searchCompact.length - 1, pageCompact.length - 1);
  }

  // Strategy 4: Trigram Jaccard sliding window (step=4)
  if (startIdx < 0) {
    const searchNgrams = ngramSet(searchCompact, 3);
    const windowSize = Math.min(searchCompact.length + 60, pageCompact.length);
    let bestScore = 0, bestStart = -1;
    for (let i = 0; i <= pageCompact.length - Math.min(windowSize, 10); i += 4) {
      const sim = jaccardSimilarity(searchNgrams, ngramSet(pageCompact.substring(i, Math.min(i + windowSize, pageCompact.length)), 3));
      if (sim > bestScore) { bestScore = sim; bestStart = i; }
    }
    if (bestScore >= 0.25 && bestStart >= 0) {
      startIdx = bestStart;
      endIdx = Math.min(bestStart + windowSize - 1, pageCompact.length - 1);
    }
  }

  // Strategy 5: Word overlap sliding window (step=4, final fallback)
  if (startIdx < 0) {
    const searchWords = new Set(tokenize(searchKey));
    const windowSize = Math.min(searchCompact.length + 80, pageCompact.length);
    let bestScore = 0, bestStart = -1;
    for (let i = 0; i <= pageCompact.length - Math.min(windowSize, 10); i += 4) {
      const windowWords = pageCompact.substring(i, Math.min(i + windowSize, pageCompact.length)).match(/[a-z]{3,}/g) || [];
      let score = 0;
      for (const w of windowWords) { if (searchWords.has(w)) score++; }
      if (score > bestScore) { bestScore = score; bestStart = i; }
    }
    const minWords = Math.max(2, tokenize(searchKey).length * 0.25);
    if (bestScore >= minWords && bestStart >= 0) {
      startIdx = bestStart;
      endIdx = Math.min(bestStart + windowSize - 1, pageCompact.length - 1);
    }
  }

  if (startIdx < 0 || endIdx < startIdx) return new Set();

  const matchedSpans = new Set();
  for (let ci = startIdx; ci <= Math.min(endIdx, charToWordIdx.length - 1); ci++) {
    const wmIdx = charToWordIdx[ci];
    if (wmIdx !== undefined && wordMap[wmIdx]) matchedSpans.add(wordMap[wmIdx].span);
  }
  return matchedSpans;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function PDFViewerModal({
  filename,
  pageNumber,
  displayName,
  highlightText,
  answerText,
  isSummary,
  onClose,
}) {
  const [numPages, setNumPages] = useState(null);
  const [currentPage, setCurrentPage] = useState(parseInt(pageNumber) || 1);
  const [error, setError] = useState(null);
  const pageContainerRef = useRef(null);
  const [pageKey, setPageKey] = useState(0);
  const [hlStatus, setHlStatus] = useState('pending');
  const prevFilenameRef = useRef(filename);

  const url = `${API_BASE}/api/documents/${encodeURIComponent(filename)}`;
  const targetPage = parseInt(pageNumber) || 1;

  // Sync state when modal is reused for a different citation
  useEffect(() => {
    setCurrentPage(parseInt(pageNumber) || 1);
    setPageKey(k => k + 1);
    setHlStatus('pending');
    setError(null);
    if (prevFilenameRef.current !== filename) {
      setNumPages(null);
      prevFilenameRef.current = filename;
    }
  }, [filename, pageNumber]);

  const onLoadSuccess = useCallback(({ numPages }) => setNumPages(numPages), []);
  const onLoadError = useCallback((err) => {
    setError('Failed to load PDF. Check that the document is accessible.');
    console.error('[PDFViewer] Load error:', err);
  }, []);

  // ── Text-layer highlighting ──────────────────────────────────────────────
  useEffect(() => {
    if (currentPage !== targetPage) return;

    if (!highlightText) {
      setHlStatus('none');
      return;
    }

    const searchKey = getBestClause(highlightText, answerText);
    console.log('[PDFViewer] highlightText (first 200):', highlightText?.substring(0, 200));
    console.log('[PDFViewer] searchKey:', searchKey);
    console.log('[PDFViewer] compact searchKey:', compact(searchKey));

    if (!searchKey || compact(searchKey).length < 6) {
      console.warn('[PDFViewer] searchKey too short — missed');
      setHlStatus('missed');
      return;
    }

    setHlStatus('pending');
    let cancelled = false;

    // ── Stable-count polling ─────────────────────────────────────────────
    // We wait until span count is identical across 2 consecutive 200ms ticks
    // before running highlight logic. This ensures PDF.js has finished
    // inserting all spans — MutationObserver fires mid-render and is unreliable.
    let lastSpanCount = -1;
    let stableCount = 0;
    let attempts = 0;
    const MAX_ATTEMPTS = 60; // 12 seconds max

    const poll = setInterval(() => {
      if (cancelled) { clearInterval(poll); return; }
      attempts++;

      if (attempts > MAX_ATTEMPTS) {
        clearInterval(poll);
        console.warn('[PDFViewer] Timed out waiting for text layer');
        setHlStatus('missed');
        return;
      }

      const container = pageContainerRef.current;
      if (!container) return;

      const textLayer = container.querySelector('.react-pdf__Page__textContent');
      if (!textLayer) {
        console.log('[PDFViewer] No text layer yet, attempt', attempts);
        return;
      }

      const spans = Array.from(textLayer.querySelectorAll('span'));
      const spanCount = spans.length;
      console.log('[PDFViewer] Attempt', attempts, '— spans:', spanCount, '— stable:', stableCount);

      if (spanCount === 0) return;

      if (spanCount === lastSpanCount) {
        stableCount++;
      } else {
        stableCount = 0;
        lastSpanCount = spanCount;
        return;
      }

      if (stableCount < 2) return;

      // Span count is stable — text layer is fully rendered
      clearInterval(poll);
      console.log('[PDFViewer] Text layer stable at', spanCount, 'spans');

      // Compute median font size for watermark detection
      const fontSizes = spans
        .map(sp => { const m = (sp.style.fontSize || '').match(/([\d.]+)px/); return m ? parseFloat(m[1]) : null; })
        .filter(v => v !== null && v > 0)
        .sort((a, b) => a - b);
      const medianFontSizePx = fontSizes.length ? fontSizes[Math.floor(fontSizes.length / 2)] : 0;
      console.log('[PDFViewer] medianFontSizePx:', medianFontSizePx);

      const { wordMap, pageCompact, charToWordIdx } = buildWordTokenMap(spans, medianFontSizePx);
      console.log('[PDFViewer] pageCompact (first 300):', pageCompact.substring(0, 300));
      console.log('[PDFViewer] wordMap.length:', wordMap.length, '| charToWordIdx.length:', charToWordIdx.length);

      if (pageCompact.length < 6) {
        console.warn('[PDFViewer] pageCompact too short');
        setHlStatus('missed');
        return;
      }

      const matchedSpans = findMatchSpans(searchKey, wordMap, pageCompact, charToWordIdx);
      console.log('[PDFViewer] matchedSpans.size:', matchedSpans.size);

      if (matchedSpans.size === 0) {
        console.warn('[PDFViewer] No match — hlStatus: missed');
        setHlStatus('missed');
        return;
      }

      matchedSpans.forEach(sp => {
        sp.style.backgroundColor = 'rgba(250, 204, 21, 0.40)';
        sp.style.borderRadius = '2px';
        sp.style.borderBottom = '2px solid rgba(234, 179, 8, 0.65)';
        sp.style.transition = 'background-color 0.2s ease';
      });

      const firstSpan = Array.from(matchedSpans)[0];
      if (firstSpan) firstSpan.scrollIntoView({ behavior: 'smooth', block: 'center' });

      console.log('[PDFViewer] Highlight applied successfully');
      setHlStatus('found');
    }, 200);

    return () => { cancelled = true; clearInterval(poll); };
  }, [highlightText, answerText, currentPage, targetPage, pageKey]);

  function goToPrevPage() {
    setCurrentPage(p => Math.max(1, p - 1));
    setPageKey(k => k + 1);
    setHlStatus('pending');
  }
  function goToNextPage() {
    setCurrentPage(p => Math.min(numPages || p, p + 1));
    setPageKey(k => k + 1);
    setHlStatus('pending');
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl flex flex-col w-[780px] max-w-[95vw] max-h-[90vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-slate-50 rounded-t-2xl">
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold text-slate-800 truncate">{displayName}</span>
            {numPages && (
              <span className="text-xs text-slate-500">Page {currentPage} of {numPages}</span>
            )}
          </div>
          <div className="flex items-center gap-2 ml-4 flex-shrink-0">
            <button onClick={goToPrevPage} disabled={currentPage <= 1}
              className="p-1.5 rounded-lg hover:bg-slate-200 disabled:opacity-30 transition-colors" aria-label="Previous page">
              <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-xs text-slate-500 w-16 text-center">{currentPage} / {numPages || '—'}</span>
            <button onClick={goToNextPage} disabled={!numPages || currentPage >= numPages}
              className="p-1.5 rounded-lg hover:bg-slate-200 disabled:opacity-30 transition-colors" aria-label="Next page">
              <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <button onClick={onClose}
              className="ml-2 p-1.5 rounded-lg hover:bg-red-50 hover:text-red-500 text-slate-400 transition-colors" aria-label="Close PDF viewer">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Status banners */}
        {!isSummary && currentPage === targetPage && hlStatus === 'found' && (
          <div className="flex items-center gap-2 px-5 py-2 border-b bg-yellow-50 border-yellow-200 text-yellow-800 text-xs">
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>Highlighted the referenced passage on this page.</span>
          </div>
        )}
        {currentPage === targetPage && hlStatus === 'missed' && (
          <div className="flex items-center gap-2 px-5 py-2 border-b bg-amber-50 border-amber-200 text-amber-700 text-xs">
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Referenced content is on or near this page — exact passage could not be pinpointed. Use arrows to browse.</span>
          </div>
        )}
        {currentPage === targetPage && hlStatus === 'none' && (
          <div className="flex items-center gap-2 px-5 py-2 border-b bg-slate-50 border-slate-200 text-slate-500 text-xs">
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>No excerpt available for this source — showing the referenced page.</span>
          </div>
        )}

        {/* PDF Renderer */}
        <div className="overflow-auto flex-1 flex justify-center bg-slate-100 p-4" ref={pageContainerRef}>
          {error ? (
            <div className="flex items-center justify-center h-40 text-red-500 text-sm">{error}</div>
          ) : (
            <Document
              file={url}
              onLoadSuccess={onLoadSuccess}
              onLoadError={onLoadError}
              options={pdfOptions}
              loading={
                <div className="flex items-center justify-center w-[720px] min-h-[1018px] bg-white shadow-sm text-slate-400 text-sm">
                  Loading document…
                </div>
              }
            >
              <Page
                key={pageKey}
                pageNumber={currentPage}
                width={720}
                className="bg-white shadow-sm"
                renderTextLayer={true}
                renderAnnotationLayer={true}
                loading={
                  <div className="flex items-center justify-center w-[720px] min-h-[1018px] bg-white text-slate-400 text-sm">
                    Rendering page…
                  </div>
                }
              />
            </Document>
          )}
        </div>
      </div>
    </div>
  );
}
