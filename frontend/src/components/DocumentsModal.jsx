import React, { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function ThumbnailPreview({ filename }) {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div className="h-[120px] bg-slate-50 border-b border-slate-100 flex items-center justify-center relative overflow-hidden group-hover:bg-blue-50/30 transition-colors">
        <div className="relative">
          <div className="w-12 h-16 bg-white border-2 border-slate-300 rounded-sm shadow-sm group-hover:border-blue-400 transition-colors">
            <div className="absolute top-0 right-0 border-t-[12px] border-l-[12px] border-t-slate-50 border-l-slate-200 group-hover:border-l-blue-200 transition-colors"></div>
            <div className="absolute top-0 right-0 border-t-[12px] border-r-[12px] border-t-transparent border-r-slate-50"></div>
            <div className="mt-5 mx-2 border-t-2 border-slate-200 group-hover:border-blue-200 transition-colors"></div>
            <div className="mt-1.5 mx-2 border-t-2 border-slate-200 group-hover:border-blue-200 transition-colors"></div>
            <div className="mt-1.5 mx-2 w-2/3 border-t-2 border-slate-200 group-hover:border-blue-200 transition-colors"></div>
          </div>
          <div className="absolute -bottom-2 -right-2 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm">PDF</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[120px] bg-slate-100 border-b border-slate-100 relative overflow-hidden group-hover:opacity-90 transition-opacity">
      <img 
        src={`${API_BASE}/api/thumbnails/${encodeURIComponent(filename)}?v=1`} 
        alt="Document preview" 
        className="w-full h-full object-cover object-top"
        onError={() => setError(true)}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent"></div>
    </div>
  );
}

export default function DocumentsModal({ isOpen, onClose, documents, onViewDocument, isLoading }) {
  const [searchTerm, setSearchTerm] = useState('');

  // Handle escape key to close
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filteredDocs = documents.filter(doc => {
    const displaySource = doc.filename
      .replace(/^(\d+_)?/, '') 
      .replace(/_/g, ' ')     
      .replace(/\.pdf$/i, '');
    return displaySource.toLowerCase().includes(searchTerm.toLowerCase());
  });

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 md:p-8"
      onClick={onClose}
    >
      <div 
        className="bg-[#fdfdfd] w-full max-w-5xl h-[90vh] md:h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header & Search */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-6 md:px-8 py-5 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-navy tracking-tight">Documents</h2>
            <span className="bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full text-xs font-semibold">
              {documents.length} Total
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative w-full md:w-64 lg:w-80">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input 
                type="text"
                placeholder="Search documents..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
              />
            </div>
            <button 
              onClick={onClose}
              className="p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-xl transition-colors shrink-0"
              title="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-slate-50/50 min-h-0">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-3">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <p>Loading documents...</p>
            </div>
          ) : filteredDocs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-3">
              <svg className="w-12 h-12 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p>No documents found.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {filteredDocs.map((doc, idx) => {
                const displaySource = doc.filename
                  .replace(/^(\d+_)?/, '') 
                  .replace(/_/g, ' ')     
                  .replace(/\.pdf$/i, '');
                  
                return (
                  <button
                    key={idx}
                    onClick={() => {
                      onViewDocument(doc.filename, displaySource);
                    }}
                    className="group bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-lg hover:border-blue-200 hover:ring-2 hover:ring-blue-500/10 transition-all duration-300 flex flex-col text-left h-[200px]"
                  >
                    {/* Top Preview Area */}
                    <ThumbnailPreview filename={doc.filename} />
                    
                    {/* Bottom Info Area */}
                    <div className="p-4 flex flex-col flex-1">
                      <h3 className="text-sm font-semibold text-slate-800 line-clamp-2 leading-snug group-hover:text-blue-700 transition-colors">
                        {displaySource}
                      </h3>
                      <p className="text-[11px] font-medium text-slate-400 mt-auto pt-2 uppercase tracking-wide">
                        PDF Document
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
