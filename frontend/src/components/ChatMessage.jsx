import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { submitFeedback, translateAnswer } from '../api/client';
import logoIcon from '../assets/Indian_Oil_Icon.svg';
import PDFViewerModal from './PDFViewerModal';

// Fallback markdown parsing logic (Approach B) to comply with the requirement to implement both approaches
const parseBold = (text, isUser) => {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1
      ? <strong key={i} className={`font-semibold ${isUser ? 'text-white' : 'text-slate-900'}`}>{part}</strong>
      : part
  );
};

const parseMarkdown = (text, isUser) => {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    // Handle bullet points (* or -)
    if (line.trim().startsWith('* ') || line.trim().startsWith('- ')) {
      const content = line.trim().slice(2);
      return (
        <li key={i} className={`flex gap-2 text-sm mb-1.5 ${isUser ? 'text-white' : 'text-slate-800'}`}>
          <span className={`${isUser ? 'text-white/60' : 'text-navy/50'} mt-0.5 flex-shrink-0`}>•</span>
          <span>{parseBold(content, isUser)}</span>
        </li>
      );
    }
    // Handle numbered list items (e.g. "1. text")
    const numListMatch = line.trim().match(/^(\d+)\.\s+(.*)/);
    if (numListMatch) {
      const content = numListMatch[2];
      return (
        <li key={i} className={`ml-4 list-decimal text-sm mb-1.5 ${isUser ? 'text-white' : 'text-slate-800'}`}>
          {parseBold(content, isUser)}
        </li>
      );
    }
    // Handle empty lines as spacers
    if (line.trim() === '') return <div key={i} className="h-2" />;
    // Regular paragraph
    return (
      <p key={i} className={`mb-3 text-sm leading-relaxed ${isUser ? 'text-white' : 'text-slate-800'}`}>
        {parseBold(line, isUser)}
      </p>
    );
  });
};

export default function ChatMessage({ role, content, sources, rate_limited, blocked, block_reason, query, showHindi }) {
  const [copied, setCopied] = useState(false);
  const [feedbackState, setFeedbackState] = useState(null); // null, 'positive', 'negative'
  const [showLowConfidence, setShowLowConfidence] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [pdfViewer, setPdfViewer] = useState(null);
  const [translatedText, setTranslatedText] = useState(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const isUser = role === 'user';

  useEffect(() => {
    if (showHindi && !isUser && content && !blocked && !rate_limited) {
      if (!translatedText) {
        setIsTranslating(true);
        translateAnswer(content)
          .then(({ translated }) => setTranslatedText(translated ? translated.normalize('NFC') : translated))
          .catch(e => console.error("Translation failed:", e))
          .finally(() => setIsTranslating(false));
      }
    }
  }, [showHindi, isUser, content, translatedText, blocked, rate_limited]);



  // If blocked, show the inline security card instead of a chat bubble
  if (blocked) {
    return (
      <div className="flex items-start gap-2 my-2 w-full justify-start">
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 max-w-2xl w-full">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-red-500">🛡️</span>
            <span className="text-red-700 text-sm font-medium">
              Query Blocked by Security Filter
            </span>
          </div>
          <p className="text-red-600 text-xs leading-relaxed">
            {block_reason}
          </p>
        </div>
      </div>
    );
  }

  // Render content using ReactMarkdown (Approach A)
  const renderContent = (text) => {
    try {
      return (
        <ReactMarkdown
          components={{
            p: ({ children }) => (
              <p className={`mb-3 text-sm leading-relaxed ${isUser ? 'text-white' : 'text-slate-800'}`}>
                {children}
              </p>
            ),
            strong: ({ children }) => (
              <strong className={`font-semibold ${isUser ? 'text-white' : 'text-slate-900'}`}>
                {children}
              </strong>
            ),
            ul: ({ children }) => (
              <ul className="mb-3 space-y-1.5 pl-1">
                {children}
              </ul>
            ),
            li: ({ children, ordered, ...props }) => {
              if (ordered) {
                return (
                  <li className={`text-sm ${isUser ? 'text-white' : 'text-slate-800'} mb-1.5`} {...props}>
                    {children}
                  </li>
                );
              }
              return (
                <li className={`flex gap-2 text-sm ${isUser ? 'text-white' : 'text-slate-800'} mb-1.5`} {...props}>
                  <span className={`${isUser ? 'text-indigo-200' : 'text-indigo-400'} mt-0.5 flex-shrink-0`}>•</span>
                  <span>{children}</span>
                </li>
              );
            },
            ol: ({ children }) => (
              <ol className="mb-3 space-y-1.5 list-decimal list-inside pl-1">
                {children}
              </ol>
            ),
          }}
        >
          {text}
        </ReactMarkdown>
      );
    } catch (err) {
      // Fallback to custom inline parser (Approach B) if ReactMarkdown fails to render
      console.warn("ReactMarkdown rendering failed, falling back to manual markdown parsing:", err);
      return (
        <div className="prose prose-sm max-w-none">
          {parseMarkdown(text, isUser)}
        </div>
      );
    }
  };

  // If rate limited, show the inline warning card instead of a chat bubble
  if (rate_limited) {
    return (
      <div className="flex justify-start my-2 w-full">
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 max-w-2xl w-full">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-amber-500 text-sm">⚠️</span>
            <span className="text-amber-700 text-sm font-medium">
              Rate limit reached
            </span>
          </div>
          <p className="text-amber-600 text-xs">
            The AI service is temporarily busy. Please wait 30 seconds and try again.
          </p>
        </div>
      </div>
    );
  }

  // Post-process the content string to split out the disclaimer if present
  const idx = content ? content.indexOf('Disclaimer:') : -1;
  const mainContent = idx !== -1 ? content.slice(0, idx) : (content || '');
  const disclaimer = idx !== -1 ? content.slice(idx + 'Disclaimer:'.length) : null;

  const SUMMARY_TRIGGERS = [
    'summarize', 'summary', 'summarise', 'overview', 'brief', 
    'outline', 'explain this document', 'what is this document',
    'what does this document cover', 'give me a summary',
    'tell me about this document', 'describe this document'
  ];

  const isSummary = SUMMARY_TRIGGERS.some(trigger => 
    query?.toLowerCase().includes(trigger)
  );

  return (
    <div className={`flex w-full mb-6 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex gap-3 max-w-[85%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        {/* Avatar */}
        {isUser ? (
          <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-slate-100 text-navy flex items-center justify-center text-xs font-bold">
            U
          </div>
        ) : (
          <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center p-1.5 shadow-sm">
            <img src={logoIcon} alt="IOCL" className="w-full h-full object-contain" />
          </div>
        )}

        <div className={`flex flex-col gap-2 ${isUser ? 'items-end' : 'items-start'}`}>
          {/* Bubble */}
          <div
            className={`relative group px-4 py-3 rounded-2xl text-sm leading-relaxed transition-all duration-200 ease-in-out hover:-translate-y-[2px] hover:shadow-[0_6px_20px_rgba(0,0,0,0.2)] ${
              isUser
                ? 'bg-navy text-white rounded-tr-sm shadow-sm'
                : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm shadow-sm pr-10'
            }`}
          >
            {renderContent((showHindi && translatedText) ? translatedText : mainContent)}
            {isTranslating && (
              <div className="mt-2 text-[11px] font-semibold text-orange animate-pulse">
                Translating...
              </div>
            )}
            {disclaimer && (
              <div className="mt-3 pt-3 border-t border-slate-200">
                <p className={`text-xs italic ${isUser ? 'text-slate-200' : 'text-slate-400'}`}>
                  ⓘ {disclaimer.trim()}
                </p>
              </div>
            )}
            
            {/* Copy Button (only for assistant) */}
            {!isUser && (
              <button
                onClick={() => {
                  let textToCopy = mainContent;
                  if (sources && sources.length > 0) {
                    textToCopy += '\n\nSources:\n';
                    sources.forEach(src => {
                      const sourceObj = typeof src === 'string' ? { source: src } : src;
                      if (sourceObj.source) {
                        textToCopy += `- ${sourceObj.source}`;
                        if (sourceObj.page_number && sourceObj.page_number !== 'unknown') {
                          textToCopy += `, Page ${sourceObj.page_number}`;
                        }
                        textToCopy += '\n';
                      }
                    });
                  }
                  navigator.clipboard.writeText(textToCopy);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="copy-btn absolute top-2 right-2 p-1.5 rounded-lg bg-slate-50 text-slate-400 hover:text-slate-600 hover:bg-slate-100 opacity-0 group-hover:opacity-100 transition-all duration-200 ease-in-out hover:scale-110 border border-slate-200 shadow-sm"
                title="Copy answer"
              >
                {copied ? (
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
            )}
          </div>

          {/* Sources */}
          {sources && sources.length > 0 && (
            <div className="w-full mt-3">
              <button
                onClick={() => setShowSources(!showSources)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-full hover:bg-slate-50 transition-colors shadow-sm"
              >
                <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${showSources ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                {showSources ? 'Hide Sources' : `View ${sources.length} ${sources.length === 1 ? 'Source' : 'Sources'}`}
              </button>
              
              {showSources && (
                <div className="mt-3 animate-in fade-in slide-in-from-top-2 duration-300">
                  {(() => {
                    // Pre-process and categorize sources by confidence
            const getScorePercentage = (score) => {
              if (score === undefined || score === null) return 100;
              if (score > 1) return Math.round(score);
              
              // Scale FAISS embedding relevance scores to intuitive percentages
              // > 0.65 is excellent (90-99%)
              // > 0.50 is good (75-89%)
              // > 0.35 is acceptable (60-74%)
              // < 0.35 is poor (<60%)
              if (score >= 0.65) {
                return Math.round(90 + ((score - 0.65) / 0.35) * 9);
              } else if (score >= 0.50) {
                return Math.round(75 + ((score - 0.50) / 0.15) * 14);
              } else if (score >= 0.35) {
                return Math.round(60 + ((score - 0.35) / 0.15) * 14);
              } else {
                return Math.round(Math.max(0, (score / 0.35) * 59));
              }
            };

            const primarySources = [];
            const lowConfidenceSources = [];

            sources.forEach((src) => {
              const sourceObj = typeof src === 'string' ? { source: src } : src;
              if (!sourceObj.source) return;
              sourceObj._percentage = getScorePercentage(sourceObj.score);
              if (sourceObj._percentage < 60) {
                lowConfidenceSources.push(sourceObj);
              } else {
                primarySources.push(sourceObj);
              }
            });

            primarySources.sort((a, b) => b._percentage - a._percentage);
            lowConfidenceSources.sort((a, b) => b._percentage - a._percentage);

            const renderSourceCard = (sourceObj, i) => {
              const percentage = sourceObj._percentage;
              const category = sourceObj.category || sourceObj.section || 'General';
              const pageNum = sourceObj.page_number;
              
              // Left-border styling based on category
              let categoryBorderClass = '';
              const catLower = category.toLowerCase();
              if (catLower.includes('safety regulation')) {
                categoryBorderClass = 'border-l-4 border-l-orange-400';
              } else if (catLower.includes('regulatory')) {
                categoryBorderClass = 'border-l-4 border-l-blue-400';
              } else if (catLower.includes('sop')) {
                categoryBorderClass = 'border-l-4 border-l-green-400';
              }

              // Confidence styling
              let confidenceOpacity = 'opacity-100';
              let confidenceBg = 'bg-amber-50 border-amber-100 text-amber-800';
              let badgeBg = 'bg-amber-100 text-amber-950';
              
              if (percentage >= 75) {
                // High confidence - keep default styling
              } else if (percentage >= 60) {
                // Medium confidence
                confidenceOpacity = 'opacity-90';
                confidenceBg = 'bg-slate-50 border-slate-200 text-slate-700';
                badgeBg = 'bg-slate-200 text-slate-700';
                categoryBorderClass = 'border-l-4 border-l-slate-400'; // neutral accent
              } else {
                // Low confidence
                confidenceOpacity = 'opacity-70';
                confidenceBg = 'bg-slate-50 border-slate-200 text-slate-500';
                badgeBg = 'bg-slate-200 text-slate-600';
                categoryBorderClass = 'border-l-4 border-l-slate-300';
              }

              // Clean up ugly filenames
              let displaySource = sourceObj.source;
              if (displaySource) {
                displaySource = displaySource
                  .replace(/^(\d+_)?/, '') // Remove leading numbers and underscore
                  .replace(/_/g, ' ')     // Replace underscores with spaces
                  .replace(/\.pdf$/i, '') // Remove .pdf
                  .replace(/\s+Full$/i, '') // Remove trailing "Full"
                  .replace(/\s+SOP$/i, ''); // Remove trailing "SOP"
              } else {
                displaySource = 'Unknown Source';
              }

              return (
                <div
                  key={i}
                  className={`relative border rounded-xl px-3 py-2 text-xs transition-opacity cursor-pointer hover:shadow-md hover:scale-[1.01] transition-all ${confidenceBg} ${categoryBorderClass} ${confidenceOpacity}`}
                  onClick={() => {
                    if (sourceObj.source && sourceObj.source.endsWith(".pdf")) {
                      setPdfViewer({ 
                        filename: sourceObj.source, 
                        pageNumber: sourceObj.page_number || 1, 
                        displayName: displaySource,
                        highlightText: sourceObj.preview || '',
                        answerText: content || ''
                      });
                    }
                  }}
                >
                  {/* Score badge in top-right */}
                  {sourceObj.score !== undefined && sourceObj.score !== null && (
                    <span className={`absolute top-2 right-2 font-semibold px-1.5 py-0.5 rounded text-[10px] ${badgeBg}`}>
                      {percentage}% match
                    </span>
                  )}

                  <div className="pr-16">
                    <span className="font-semibold">{displaySource}</span>
                    {category && category !== 'General' && (
                      <span className="opacity-80"> · {category}</span>
                    )}
                    {pageNum && pageNum !== 'unknown' && (
                      <span className="opacity-80"> · Page {pageNum}</span>
                    )}
                    {sourceObj.section_title && sourceObj.section_title !== 'General' && (
                      <span className="opacity-80">, {sourceObj.section_title}</span>
                    )}
                  </div>
                  {sourceObj.preview && (
                    <p className="mt-1 opacity-75 line-clamp-3 pr-4 leading-relaxed">
                      {sourceObj.preview}
                    </p>
                  )}
                </div>
              );
            };

            return (
              <div className="flex flex-col gap-1.5 w-full">
                {/* Render high/medium confidence sources */}
                {primarySources.map((src, i) => renderSourceCard(src, `primary-${i}`))}

                {/* Render toggle and low confidence sources if they exist */}
                {lowConfidenceSources.length > 0 && (
                  <>
                    {primarySources.length > 0 && (
                      <button
                        onClick={() => setShowLowConfidence(!showLowConfidence)}
                        className="text-xs text-slate-500 hover:text-slate-700 text-left mt-1 flex items-center gap-1 transition-colors"
                      >
                        <svg className={`w-3 h-3 transition-transform ${showLowConfidence ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        {showLowConfidence ? 'Hide' : 'Show'} {lowConfidenceSources.length} additional lower-confidence {lowConfidenceSources.length === 1 ? 'source' : 'sources'}
                      </button>
                    )}
                    {(showLowConfidence || primarySources.length === 0) && (
                      <div className="flex flex-col gap-1.5 w-full mt-1">
                        {lowConfidenceSources.map((src, i) => renderSourceCard(src, `low-${i}`))}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })()}
                </div>
              )}
            </div>
          )}


          {!isUser && !blocked && !rate_limited && (
            <div className="flex gap-2 items-center text-xs ml-1 mt-1">
              <span className="text-slate-400">Helpful?</span>
              <button 
                onClick={async () => {
                  if (feedbackState) return;
                  setFeedbackState('positive');
                  await submitFeedback(query || "", mainContent, sources || [], true);
                }}
                disabled={feedbackState !== null}
                className={`flex items-center justify-center p-1 rounded hover:bg-slate-200 transition-colors ${feedbackState === 'positive' ? 'text-green-600 bg-green-50' : 'text-slate-400'}`}
                title="Thumbs up"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                </svg>
              </button>
              <button 
                onClick={async () => {
                  if (feedbackState) return;
                  setFeedbackState('negative');
                  await submitFeedback(query || "", mainContent, sources || [], false);
                }}
                disabled={feedbackState !== null}
                className={`flex items-center justify-center p-1 rounded hover:bg-slate-200 transition-colors ${feedbackState === 'negative' ? 'text-red-600 bg-red-50' : 'text-slate-400'}`}
                title="Thumbs down"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.714.211-1.412.608-2.006L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
                </svg>
              </button>
              {feedbackState && <span className="text-slate-400 text-[10px] ml-1 opacity-70">Feedback recorded</span>}
            </div>
          )}

        </div>
      {pdfViewer && (
        <PDFViewerModal
          filename={pdfViewer.filename}
          pageNumber={pdfViewer.pageNumber}
          displayName={pdfViewer.displayName}
          highlightText={pdfViewer.highlightText}
          answerText={pdfViewer.answerText}
          isSummary={isSummary}
          onClose={() => setPdfViewer(null)}
        />
      )}
      </div>
    </div>
  );
}
