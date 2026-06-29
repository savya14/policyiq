import React, { useEffect, useState } from 'react';
import { getPublicDocuments } from '../api/client';
import logo from '../assets/Indian_Oil_Logo.svg';

export default function Sidebar({ isOpen, onClose, onSelectSession, onDeleteSession, currentSessionId, onOpenDocuments }) {
  const [history, setHistory] = useState([]);
  const [openMenuId, setOpenMenuId] = useState(null);

  useEffect(() => {
    const handleClickOutside = () => setOpenMenuId(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Load history from sessionStorage
  useEffect(() => {
    const loadHistory = () => {
      try {
        const saved = sessionStorage.getItem('policyiq_chat_history');
        if (saved) {
          const parsed = JSON.parse(saved);
          // Sort by updated_at descending
          parsed.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
          setHistory(parsed);
        }
      } catch (e) {
        console.error("Failed to load history", e);
      }
    };
    
    if (isOpen) {
      loadHistory();
      const interval = setInterval(loadHistory, 2000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  // Load history from sessionStorage
  return (
    <div 
      className={`fixed md:relative inset-y-0 left-0 z-40 bg-[#fdfdfd] border-slate-200 transition-all duration-300 ease-in-out flex flex-col flex-shrink-0 overflow-hidden ${
        isOpen ? 'w-[280px] border-r translate-x-0' : 'w-0 border-r-0 -translate-x-full md:translate-x-0'
      }`}
    >
      <div className="w-[280px] h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 min-h-[60px]">
        <div className="flex items-center gap-2">
          <img src={logo} alt="IOCL" className="h-6 w-auto" />
          <span className="font-bold text-navy tracking-tight text-lg">PolicyIQ</span>
        </div>
        <button 
          onClick={onClose}
          className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          title="Close sidebar"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" strokeWidth="1.5"/>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 3v18M14 15l-3-3 3-3" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-1 text-[#111111]">
        
        {/* New Chat Button */}
        <button
          onClick={() => {
            onSelectSession(null); // Create new session
          }}
          className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-slate-100 transition-colors text-left group"
        >
          <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center group-hover:bg-slate-200 transition-colors border border-slate-200/60">
            <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <span className="font-medium text-[15px]">New chat</span>
        </button>

        {/* Documents Browser Button */}
        <button
          onClick={() => {
            onOpenDocuments();
            if (window.innerWidth < 1024) onClose();
          }}
          className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-slate-100 transition-colors text-left mt-1"
        >
          <div className="w-7 h-7 flex items-center justify-center">
            <svg className="w-[22px] h-[22px] text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <span className="font-medium text-[15px] flex-1">Available Documents</span>
        </button>



        {/* History Section */}
        {history.length > 0 && (
          <div className="mt-6 mb-2">
            <h3 className="text-xs font-semibold text-slate-400 px-3 uppercase tracking-wider mb-2">Recent Chats</h3>
            <div className="flex flex-col gap-0.5">
              {history.map(session => (
                <div key={session.id} className="relative group flex items-center">
                  <button
                    onClick={() => onSelectSession(session.id)}
                    className={`flex-1 text-left px-3 py-2 pr-8 rounded-lg text-[14px] transition-colors truncate ${
                      currentSessionId === session.id 
                        ? 'bg-slate-100 font-medium text-slate-900' 
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                    title={session.title}
                  >
                    {session.title || 'New Chat'}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenuId(openMenuId === session.id ? null : session.id);
                    }}
                    className={`absolute right-2 p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors md:opacity-0 md:group-hover:opacity-100 ${currentSessionId === session.id || openMenuId === session.id ? 'md:opacity-100' : ''}`}
                    title="Options"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="1"></circle>
                      <circle cx="12" cy="5" r="1"></circle>
                      <circle cx="12" cy="19" r="1"></circle>
                    </svg>
                  </button>
                  {openMenuId === session.id && (
                    <div className="absolute right-2 top-8 w-32 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-50">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm("Are you sure you want to delete this chat?")) {
                            if (onDeleteSession) onDeleteSession(session.id);
                            setHistory(h => h.filter(s => s.id !== session.id));
                          }
                          setOpenMenuId(null);
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                           <polyline points="3 6 5 6 21 6"></polyline>
                           <path d="M19 6l-1 14H6L5 6"></path>
                           <path d="M10 11v6"></path>
                           <path d="M14 11v6"></path>
                           <path d="M9 6V4h6v2"></path>
                        </svg>
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
      </div>
    </div>
  );
}
