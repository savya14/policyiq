import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import DocumentTable from '../components/DocumentTable';
import { adminLogin, getDocuments, uploadDocument, deleteDocument, getFeedbackLogs, deleteFeedbackAdmin } from '../api/client';
import logo from '../assets/Indian_Oil_Logo.svg';

export default function Admin() {
  const navigate = useNavigate();
  const [token, setToken] = useState(localStorage.getItem('policyiq_token'));
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [documents, setDocuments] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);

  const [feedbacks, setFeedbacks] = useState([]);
  const [feedbacksLoading, setFeedbacksLoading] = useState(false);

  const [override, setOverride] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState(null); // { success, message }
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const handleLogin = async () => {
    setLoginLoading(true);
    setLoginError('');
    try {
      const { token: t } = await adminLogin(password);
      localStorage.setItem('policyiq_token', t);
      setToken(t);
    } catch {
      setLoginError('Incorrect password.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('policyiq_token');
    setToken(null);
    setPassword('');
  };

  const loadDocuments = async () => {
    setDocsLoading(true);
    try {
      const { documents: docs } = await getDocuments();
      setDocuments(docs);
    } catch (err) {
      if (err?.response?.status === 401) handleLogout();
    } finally {
      setDocsLoading(false);
    }
  };

  const loadFeedback = async () => {
    setFeedbacksLoading(true);
    try {
      const { feedbacks: fbs } = await getFeedbackLogs();
      setFeedbacks(fbs);
    } catch (err) {
      console.error(err);
    } finally {
      setFeedbacksLoading(false);
    }
  };

  const loadData = () => {
    loadDocuments();
    loadFeedback();
  };

  useEffect(() => {
    if (token) loadData();
  }, [token]);

  const handleFile = (file) => {
    if (file && file.type === 'application/pdf') {
      setSelectedFile(file);
      setUploadStatus(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setUploadStatus(null);
    try {
      const result = await uploadDocument(selectedFile, override);
      setUploadStatus(result);
      if (result.success) {
        setSelectedFile(null);
        setOverride(false); // reset override checkbox
        loadData();
      }
    } catch (err) {
      if (err?.response?.status === 401) {
        handleLogout();
      } else {
        setUploadStatus({ success: false, message: 'Upload failed. Please try again.' });
      }
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (filename) => {
    // Throws on error so DocumentTable can catch and show inline error
    await deleteDocument(filename);
    // On success, refresh the list
    await loadData();
  };

  const handleDeleteFeedback = async (timestamp) => {
    if (!window.confirm("Are you sure you want to permanently delete this feedback?")) return;
    try {
      await deleteFeedbackAdmin(timestamp);
      await loadFeedback();
    } catch (err) {
      if (err?.response?.status === 401) {
        handleLogout();
      } else {
        alert("Failed to delete feedback. Please try again.");
      }
    }
  };

  // ─── Login screen ────────────────────────────────────────────
  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 page-enter" style={{ backgroundColor: '#fcfdfd' }}>
        <div className="bg-white rounded-[24px] border border-slate-200 p-8 sm:p-10 w-full max-w-[420px] shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <div className="flex items-start justify-between mb-8">
            <div className="flex items-center gap-3">
              <img src={logo} alt="IOCL" className="h-10 w-auto object-contain" />
              <div className="flex flex-col justify-center">
                <span className="text-[20px] font-bold text-[#1e2d78] leading-none tracking-tight">IndianOil</span>
                <span className="text-[9px] font-bold text-slate-400 tracking-[0.2em] uppercase mt-1.5 leading-none">PolicyIQ</span>
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-200 text-slate-500 text-[10px] uppercase tracking-widest font-bold px-3 py-1 rounded-full mt-0.5">
              Admin
            </div>
          </div>
          
          <h1 className="text-[28px] font-bold text-[#1e2d78] mb-1.5 tracking-tight">Sign in</h1>
          <p className="text-sm text-slate-400 mb-8">Restricted to authorised administrators.</p>

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            placeholder="Admin password"
            className="w-full bg-white border border-slate-200 rounded-[14px] px-4 py-3.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:outline-none focus:ring-0 focus:border-[#a3b1d6] mb-4 transition-colors duration-300 ease-in-out"
          />
          
          {loginError && <p className="text-sm text-red-500 mb-4 pl-1">{loginError}</p>}
          
          <button
            onClick={handleLogin}
            disabled={!password || loginLoading}
            className={`w-full text-white py-3.5 rounded-[14px] text-sm font-bold transition-all ${
              password && !loginLoading
                ? 'bg-[#1e2d78] hover:bg-[#15215c] shadow-md hover:shadow-lg translate-y-0 hover:-translate-y-0.5'
                : 'bg-[#d3d8e8] shadow-sm cursor-not-allowed'
            }`}
          >
            {loginLoading ? 'Signing in…' : 'Sign in'}
          </button>
          
          <button
            onClick={() => navigate('/')}
            className="w-full flex items-center justify-center gap-2 text-xs text-slate-400 hover:text-slate-600 mt-6 transition-colors"
          >
            <span className="text-base leading-none mt-[-2px]">←</span> Back to home
          </button>
        </div>
      </div>
    );
  }

  // ─── Admin panel ─────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-white page-enter">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-2 -ml-2 mr-1 rounded-full hover:bg-slate-100 transition-colors text-slate-400 hover:text-navy" title="Back to landing page">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </button>
          <button onClick={() => navigate('/')} className="flex items-center gap-3 hover:opacity-80 transition-opacity text-left">
            <img src={logo} alt="IOCL" className="h-10 w-auto object-contain" />
            <div className="flex flex-col justify-center">
              <span className="text-[20px] font-bold text-[#1e2d78] leading-none tracking-tight">IndianOil</span>
              <span className="text-[10px] font-bold text-slate-400 tracking-[0.15em] uppercase mt-1 leading-none">PolicyIQ</span>
            </div>
          </button>
          <span className="text-slate-300 ml-2">·</span>
          <span className="text-xs text-slate-400 uppercase tracking-wider ml-1">Admin Panel</span>
        </div>
        <button
          onClick={handleLogout}
          className="text-xs text-slate-400 hover:text-slate-600 transition-colors relative after:absolute after:bottom-[-2px] after:left-0 after:w-0 after:h-[2px] after:bg-blue-500 after:transition-all after:duration-200 hover:after:w-full"
        >
          Sign out
        </button>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">
        {/* Deployment note */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-500 leading-relaxed">
          <strong className="text-slate-600">Note:</strong> Uploads are processed immediately and the FAISS index is updated on the server.
          If running locally, commit the updated <code className="bg-slate-100 px-1 rounded">vector_store/</code> files
          so index changes persist across server restarts.
        </div>

        {/* Upload */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="font-bold text-navy text-base mb-4">Upload Document</h2>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
              dragOver ? 'border-navy bg-navy/5' : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => handleFile(e.target.files[0])}
            />
            {selectedFile ? (
              <div>
                <p className="text-sm font-semibold text-navy">{selectedFile.name}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB · PDF
                </p>
              </div>
            ) : (
              <div>
                <p className="text-sm text-slate-500">Drag & drop a PDF here, or click to browse</p>
                <p className="text-xs text-slate-400 mt-1">PDF files only</p>
              </div>
            )}
          </div>

          {uploadStatus && (
            <div className={`mt-3 text-xs px-3 py-2 rounded-lg ${
              uploadStatus.success
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-600 border border-red-200'
            }`}>
              {uploadStatus.message}
            </div>
          )}

          <div className="flex items-center gap-4 mt-4">
            <button
              onClick={handleUpload}
              disabled={!selectedFile || uploading}
              className="bg-navy text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-navy-light disabled:opacity-40 transition-all"
            >
              {uploading ? 'Indexing…' : 'Upload & Index'}
            </button>
            {selectedFile && (
              <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={override}
                  onChange={(e) => setOverride(e.target.checked)}
                  className="rounded border-slate-300 text-navy focus:ring-navy focus:border-navy"
                />
                Override standard warnings
              </label>
            )}
          </div>
        </div>

        {/* Indexed documents */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-navy text-base">Indexed Documents</h2>
            <button
              onClick={loadDocuments}
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              Refresh
            </button>
          </div>
          {docsLoading ? (
            <p className="text-sm text-slate-400 py-4">Loading…</p>
          ) : (
            <DocumentTable documents={documents} onDelete={handleDelete} />
          )}
        </div>

        {/* Feedback Logs */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-bold text-navy text-base">User Feedback Logs</h2>
              {!feedbacksLoading && feedbacks.length > 0 && (
                <p className="text-xs text-slate-500 mt-1">
                  Total feedback: {feedbacks.length} | Positive: {((feedbacks.filter(f => f.is_positive).length / feedbacks.length) * 100).toFixed(0)}%
                </p>
              )}
            </div>
            <button
              onClick={loadFeedback}
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              Refresh
            </button>
          </div>
          {feedbacksLoading ? (
            <p className="text-sm text-slate-400 py-4">Loading…</p>
          ) : feedbacks.length === 0 ? (
            <p className="text-sm text-slate-400 py-4">No feedback logs found.</p>
          ) : (
            <div className="flex flex-col gap-4 max-h-[500px] overflow-y-auto pr-2">
              {feedbacks.map((fb, i) => (
                <div key={i} className="border border-slate-200 rounded-xl p-4 text-sm flex flex-col gap-2">
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <span className="font-semibold text-slate-700">Query: </span>
                      <span className="text-slate-600">{fb.query}</span>
                    </div>
                    <div className={`px-2 py-1 rounded text-xs font-semibold ${fb.is_positive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {fb.is_positive ? '👍 Helpful' : '👎 Not Helpful'}
                    </div>
                  </div>
                  <div className="bg-slate-50 p-2 rounded text-xs text-slate-600 line-clamp-2">
                    <span className="font-semibold text-slate-500">Response: </span>
                    {fb.response}
                  </div>
                  {fb.sources && fb.sources.length > 0 && (
                    <div className="text-xs text-slate-500">
                      <span className="font-semibold">Sources cited: </span>
                      {fb.sources.map(s => s.source).join(', ')}
                    </div>
                  )}
                  <div className="flex justify-between items-center mt-1">
                    <div className="text-[10px] text-slate-400">
                      {new Date(fb.timestamp).toLocaleString()}
                    </div>
                    <button
                      onClick={() => handleDeleteFeedback(fb.timestamp)}
                      className="text-xs text-red-500 hover:text-red-700 transition-colors bg-red-50 hover:bg-red-100 px-2 py-1 rounded font-medium"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
