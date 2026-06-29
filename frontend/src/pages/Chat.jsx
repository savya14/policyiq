import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import logo from '../assets/Indian_Oil_Logo.svg';
import ChatMessage from '../components/ChatMessage';
import { askQuestion, getPublicDocuments } from '../api/client';
import SearchBox from '../components/SearchBox';
import Sidebar from '../components/Sidebar';
import PDFViewerModal from '../components/PDFViewerModal';
import DocumentsModal from '../components/DocumentsModal';

const QUESTION_POOL = [
  'What is the calibration frequency for pressure gauges in LPG installations?',
  'What is the inspection interval for fire water tanks under OISD-STD-144?',
  'How frequently must a firewater reservoir be cleaned in an LPG installation?',
  'What are the safety distances required for LPG storage from buildings?',
  'What fire protection systems are mandatory for petroleum depots under OISD?',
  'What are the requirements for earthing and bonding in petroleum installations?',
  'What is the maximum permissible hydrogen sulfide (H₂S) concentration at workplaces?',
  'What are the guidelines for hot work permits in hazardous areas?',
  'What are the OISD guidelines for pipeline patrol frequency?',
  'What is the recommended frequency for safety audits under OISD standards?',
  'What are the emergency response plan requirements for LPG bottling plants?',
  'What fire extinguisher types are required near petroleum storage tanks?',
  'What are the training requirements for personnel handling petroleum products?',
  'What is the minimum distance between an LPG storage vessel and a property boundary?',
  'What are the inspection requirements for underground pipelines under OISD?',
  'What are the safety precautions for tank cleaning operations?',
  'What are the lightning protection requirements for petroleum storage?',
  'How often should emergency drills be conducted at petroleum installations?',
  'What are the requirements for gas detection systems in refineries?',
  'What personal protective equipment is mandatory for petroleum handling?',
  'What are the PESO rules for pressure vessel inspection intervals?',
  'What are the guidelines for static electricity control during fuel loading?',
  'What is the maximum storage limit for petroleum products in retail outlets?',
  'What ventilation requirements apply to LPG cylinder storage areas?',
  'What are the PNGRB regulations for natural gas pipeline right of way?',
];

function pickRandom(pool, count) {
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export default function Chat() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [showHindi, setShowHindi] = useState(false);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth >= 1024);
  const [pdfViewer, setPdfViewer] = useState(null);
  const [showDocumentsModal, setShowDocumentsModal] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [suggested, setSuggested] = useState(() => pickRandom(QUESTION_POOL, 3));
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const searchBoxContainerRef = useRef(null);

  // Helper to save session
  useEffect(() => {
    if (sessionId && messages.length > 0) {
      try {
        const saved = sessionStorage.getItem('policyiq_chat_history');
        let history = saved ? JSON.parse(saved) : [];
        const existingIdx = history.findIndex(s => s.id === sessionId);
        const sessionData = {
          id: sessionId,
          messages: messages,
          title: messages.find(m => m.role === 'user')?.content?.substring(0, 40) + '...',
          updated_at: new Date().toISOString()
        };
        if (existingIdx >= 0) {
          // If the message count is the same, this is just a load/render. Preserve the original timestamp.
          if (history[existingIdx].messages.length === messages.length) {
            sessionData.updated_at = history[existingIdx].updated_at;
          }
          history[existingIdx] = sessionData;
        } else {
          history.push(sessionData);
        }
        sessionStorage.setItem('policyiq_chat_history', JSON.stringify(history));
      } catch (e) {
        console.error("Failed to save history", e);
      }
    }
  }, [messages, sessionId]);

  useEffect(() => {
    if (showDocumentsModal && documents.length === 0) {
      setIsLoadingDocs(true);
      getPublicDocuments()
        .then(res => {
          if (res.documents) setDocuments(res.documents);
        })
        .catch(err => console.error("Failed to load documents", err))
        .finally(() => setIsLoadingDocs(false));
    }
  }, [showDocumentsModal, documents.length]);

  const loadSession = (id) => {
    if (!id) {
      setMessages([]);
      setSessionId(null);
      setSuggested(pickRandom(QUESTION_POOL, 3));
      if (window.innerWidth < 1024) setSidebarOpen(false);
      return;
    }

    try {
      const saved = sessionStorage.getItem('policyiq_chat_history');
      if (saved) {
        const history = JSON.parse(saved);
        const session = history.find(s => s.id === id);
        if (session) {
          setSessionId(id);
          setMessages(session.messages);
          if (window.innerWidth < 1024) setSidebarOpen(false);
        }
      }
    } catch (e) {
      console.error("Failed to load session", e);
    }
  };

  const deleteSession = (id) => {
    try {
      const saved = sessionStorage.getItem('policyiq_chat_history');
      if (saved) {
        let history = JSON.parse(saved);
        history = history.filter(s => s.id !== id);
        sessionStorage.setItem('policyiq_chat_history', JSON.stringify(history));
      }
    } catch (e) {
      console.error("Failed to delete session", e);
    }
    
    // If deleted session is currently active, reset the view
    if (sessionId === id) {
      setMessages([]);
      setSessionId(null);
    }
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    if (!searchBoxContainerRef.current) return;
    const observer = new ResizeObserver(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    });
    observer.observe(searchBoxContainerRef.current);
    return () => observer.disconnect();
  }, []);

  const handleResize = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto'; // Always reset before measuring
      el.style.height = el.scrollHeight + 'px';
    }
  };

  const handleChange = (e) => {
    setInput(e.target.value);
    handleResize();
  };

  const sendMessage = async (question) => {
    const q = question || input.trim();
    if (!q || isLoading) return;

    setInput('');
    
    // Reset textarea height to default min height
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = '40px';
    }

    setMessages((prev) => [...prev, { role: 'user', content: q, sources: null, rate_limited: false }]);
    setIsLoading(true);

    try {
      console.log("=== FRONTEND DEBUG ===");
      console.log("Selected Question:", q);
      console.log("Sending language code:", "en");
      
      const result = await askQuestion(q, sessionId, messages, "en");
      // Persist the session ID returned by the backend for conversation memory
      if (result.session_id) setSessionId(result.session_id);
      setMessages((prev) => [
        ...prev,
        { 
          role: 'assistant', 
          content: result.answer, 
          sources: result.source_documents ?? [], 
          rate_limited: result.rate_limited,
          blocked: result.blocked ?? false,
          block_reason: result.block_reason ?? "",
          query: q
        },
      ]);
    } catch (err) {
      const status = err?.response?.status;
      const isRateLimit = status === 429 || (err?.response?.data?.detail && String(err.response.data.detail).includes("429"));
      
      // If we catch client side errors, we can pass them nicely
      setMessages((prev) => [
        ...prev,
        { 
          role: 'assistant', 
          content: isRateLimit ? null : 'Something went wrong. Please try again.', 
          sources: null,
          rate_limited: isRateLimit,
          blocked: false,
          block_reason: ""
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="h-screen bg-white flex overflow-hidden">
      <Sidebar 
        isOpen={sidebarOpen} 
        onClose={() => setSidebarOpen(false)} 
        onSelectSession={loadSession}
        onDeleteSession={deleteSession}
        currentSessionId={sessionId}
        onOpenDocuments={() => setShowDocumentsModal(true)}
      />
      
      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/20 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="flex-1 flex flex-col w-full h-full relative">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 h-16 px-4 md:px-6 flex items-center justify-between z-20">
          <div className="flex items-center gap-2 md:gap-3">
            <button 
              onClick={() => setSidebarOpen(true)}
              className={`rounded-lg hover:bg-slate-100 transition-all duration-300 ease-in-out text-slate-500 hover:text-navy flex items-center justify-center ${
                sidebarOpen ? 'w-0 opacity-0 overflow-hidden p-0 m-0 pointer-events-none' : 'w-9 h-9 opacity-100 p-2 -ml-2'
              }`}
              title="Open menu"
            >
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <button onClick={() => navigate('/')} className="p-2 rounded-full hover:bg-slate-100 transition-colors text-slate-400 hover:text-navy hidden md:block" title="Back to landing page">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            </button>
            <button onClick={() => navigate('/')} className="flex items-center gap-2 md:gap-3 hover:opacity-80 transition-opacity text-left">
            <img src={logo} alt="IOCL" className="h-10 w-auto object-contain" />
            <div className="flex flex-col justify-center">
              <span className="text-[20px] font-bold text-[#1e2d78] leading-none tracking-tight">IndianOil</span>
              <span className="text-[10px] font-bold text-slate-400 tracking-[0.15em] uppercase mt-1 leading-none">PolicyIQ</span>
            </div>
          </button>
          <span className="text-slate-300 ml-2">·</span>
          <span className="text-xs text-slate-400 uppercase tracking-wider ml-1">Compliance Chat</span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowHindi(h => !h)}
            className={`flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
              showHindi
                ? 'bg-orange text-white border-orange'
                : 'border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-navy hover:border-navy/30'
            }`}
            title={showHindi ? "Show original" : "Translate answers to Hindi"}
          >
            {showHindi ? 'हिं → EN' : 'EN → हिं'}
          </button>
          <button
            onClick={() => { setMessages([]); setSessionId(null); setSuggested(pickRandom(QUESTION_POOL, 3)); }}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors relative after:absolute after:bottom-[-2px] after:left-0 after:w-0 after:h-[2px] after:bg-blue-500 after:transition-all after:duration-200 hover:after:w-full"
          >
            Clear chat
          </button>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto w-full" style={{ scrollbarGutter: 'stable' }}>
        <div className="max-w-3xl w-full mx-auto px-4 py-6">
          {messages.length === 0 && (
            <div className="text-center pt-16">
              <div className="w-16 h-16 rounded-2xl bg-white shadow-sm border border-slate-100 mx-auto mb-4 flex items-center justify-center p-2">
                <img src={logo} alt="IOCL" className="w-full h-auto object-contain" />
              </div>
              <h2 className="text-navy font-bold text-lg mb-2">Ask a compliance question</h2>
              <p className="text-slate-400 text-sm mb-8">
                Answers grounded in indexed OISD, PESO, and MoPNG documents.
              </p>
              <div className="flex flex-col gap-2 max-w-md mx-auto">
                {suggested.map((q) => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    className="text-left text-sm border border-slate-200 bg-white hover:border-navy/30 hover:bg-slate-50 rounded-xl px-4 py-3 text-slate-600 transition-all"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <ChatMessage 
              key={i} 
              role={msg.role} 
              content={msg.content} 
              sources={msg.sources} 
              rate_limited={msg.rate_limited} 
              blocked={msg.blocked}
              block_reason={msg.block_reason}
              query={msg.query}
              showHindi={showHindi}
            />
          ))}

          {/* Typing bounce animation */}
          {isLoading && (
            <div className="flex items-start gap-3 my-2">
              <div className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center flex-shrink-0 p-1">
                <img src={logo} alt="IOCL" className="w-full h-auto object-contain" />
              </div>
              <div className="bg-white border border-gray-100 rounded-2xl px-4 py-3 shadow-sm">
                <div className="flex gap-1 items-center h-5">
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]"/>
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]"/>
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]"/>
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div ref={searchBoxContainerRef} className="w-full pb-6 pt-2 px-4 z-10 bg-white border-t border-slate-100 mt-auto">
        <div className="max-w-3xl w-full mx-auto">
          <SearchBox
            value={input}
            onChange={handleChange}
            onSubmit={(val) => sendMessage(val)}
            disabled={isLoading}
            placeholder="Ask a compliance question... (Enter to send)"
          />
        </div>
      </div>
      </div>

      {/* Documents Browser Modal */}
      <DocumentsModal
        isOpen={showDocumentsModal}
        onClose={() => setShowDocumentsModal(false)}
        documents={documents}
        isLoading={isLoadingDocs}
        onViewDocument={(filename, displayName) => setPdfViewer({ filename, pageNumber: 1, displayName })}
      />

      {/* PDF Viewer for Sidebar documents */}
      {pdfViewer && (
        <PDFViewerModal
          filename={pdfViewer.filename}
          pageNumber={pdfViewer.pageNumber}
          displayName={pdfViewer.displayName}
          onClose={() => setPdfViewer(null)}
        />
      )}
    </div>
  );
}
