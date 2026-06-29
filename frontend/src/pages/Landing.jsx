import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import logo from '../assets/Indian_Oil_Logo.svg';
import logoWhite from '../assets/Indian_Oil_Logo_White.svg';
import rhinoVideo from '../assets/rhino2.mp4';

function Eyebrow({ children }) {
  return (
    <div className="text-xs font-semibold uppercase tracking-[0.22em] text-orange">
      {children}
    </div>
  );
}

function Chip({ children, tone = 'saffron' }) {
  const cls =
    tone === 'navy'
      ? 'bg-navy text-white'
      : 'bg-orange/15 text-orange border border-orange/30';
  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${cls}`}>
      {children}
    </span>
  );
}

function ChatPreview() {
  const [isHovered, setIsHovered] = useState(false);
  return (
    <div className="relative">
      <div
        className={`absolute -inset-8 rounded-[40px] pointer-events-none -z-10 transition-all duration-500 ease-in-out ${isHovered ? '-translate-y-2' : 'translate-y-0'}`}
        style={{
          background: "radial-gradient(ellipse at 30% 50%, rgba(243,112,33,0.3) 0%, rgba(243,112,33,0.08) 50%, rgba(243,112,33,0) 80%)",
          filter: "blur(32px)",
          opacity: isHovered ? 0.8 : 0.4
        }}
      />
      <div
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`relative z-10 overflow-hidden rounded-2xl border border-slate-200 bg-white transition-all duration-500 ease-out ${isHovered ? '-translate-y-2 shadow-[0_35px_60px_-15px_rgba(27,57,143,0.2)]' : 'translate-y-0 shadow-2xl shadow-navy/10'}`}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 bg-slate-50">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-orange" />
            <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          </div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">policyiq · compliance chat</div>
          <div className="text-[11px] font-mono text-slate-400">RAG · Groq</div>
        </div>
        <div className="space-y-5 px-6 py-6">
          <div className="flex justify-end">
            <div className="max-w-md rounded-2xl rounded-tr-sm bg-navy px-4 py-3 text-sm text-white">
              What is the minimum safe distance for LPG storage tanks near a process unit?
            </div>
          </div>
          <div className="space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-orange">Grounded answer</div>
            <div className="rounded-2xl rounded-tl-sm border border-slate-100 bg-slate-50 px-5 py-4">
              <p className="text-sm text-slate-700">
                As per <strong>OISD-STD-144 Cl. 6.3</strong>, the minimum distance between LPG storage tanks and a process unit is <strong>30 metres</strong> for tanks up to 450 m³, scaling to <strong>120 metres</strong> for tanks exceeding 3800 m³.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-200/60 pt-4">
                <Chip>OISD-STD-144 · p.23</Chip>
                <Chip>PESO Gas Cyl. Rules</Chip>
                <Chip tone="navy">63% match</Chip>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Hero({ navigate }) {
  return (
    <section className="relative">
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <div
          className="absolute opacity-[0.4]"
          style={{
            top: 0, right: 0, bottom: 0, left: 0,
            backgroundImage: 'linear-gradient(to right, rgba(27,57,143,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(27,57,143,0.08) 1px, transparent 1px)',
            backgroundSize: '56px 56px',
            backgroundPosition: 'center 0px',
            maskImage: 'radial-gradient(ellipse at 75% 30%, black 10%, transparent 70%)',
            WebkitMaskImage: 'radial-gradient(ellipse at 75% 30%, black 10%, transparent 70%)',
          }}
        />
      </div>
      <div className="relative mx-auto grid max-w-7xl items-start gap-14 px-6 pt-16 pb-20 md:grid-cols-2 md:pt-[112px] md:pb-28">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-navy backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-orange" />
            REFINERIES DIVISION · INTERNAL
          </div>
          <h1 className="mt-6 text-6xl font-extrabold leading-[1.02] text-navy md:text-7xl" style={{ letterSpacing: '-0.02em' }}>
            Compliance answers,
            <span className="block" style={{ background: 'linear-gradient(100deg, #1e2d78 0%, #f57c00 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              in seconds.
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-slate-500">
            Ask about OISD standards, PESO guidelines, and MoPNG circulars in plain English. Get cited, grounded answers — no PDF hunting.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button onClick={() => navigate('/chat')} className="inline-flex items-center gap-2 rounded-full bg-navy px-5 py-3 text-sm font-semibold text-white transition-all duration-300 hover:scale-[1.02] hover:bg-navy/90 hover:shadow-[0_0_20px_rgba(27,57,143,0.3)] active:scale-[0.98]">
              Ask a question <span className="text-orange">→</span>
            </button>
            <button onClick={() => navigate('/admin')} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-navy transition-all duration-300 hover:scale-[1.02] hover:bg-slate-50 hover:shadow-[0_0_20px_rgba(0,0,0,0.05)] active:scale-[0.98]">
              Admin panel
            </button>
          </div>
          <dl className="mt-[40px] flex items-center gap-12 border-t border-slate-200 pt-8">
            {[['283', 'PAGES INDEXED'], ['9', 'CIRCULARS TRACKED'], ['100%', 'ON-PREM']].map(([k, v]) => (
              <div key={v} className="flex flex-col">
                <dt className="text-4xl font-bold text-[#1e2d78]" style={{ fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '-0.04em' }}>{k}</dt>
                <dd className="mt-1 text-sm font-medium tracking-wide text-slate-500">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="relative z-10 pt-[15px]">
          <div className="pointer-events-none absolute" style={{ width: '500px', height: '500px', top: '-140px', left: '-180px', background: 'radial-gradient(circle at center, rgba(243,112,33,0.25) 0%, rgba(243,112,33,0.08) 40%, rgba(243,112,33,0) 65%)', zIndex: 0 }} />
          <div className="relative z-10">
            <ChatPreview />
          </div>
        </div>
      </div>
    </section>
  );
}

function Stats() {
  const rows = [
    { k: '≤ 10s', v: 'P95 query latency', note: 'Groq LLaMA 3 inference' },
    { k: '100%', v: 'Source-cited answers', note: 'Chunk + page always returned' },
    { k: '0', v: 'Bytes leave network', note: 'FAISS index built locally' },
    { k: '5+', v: 'Document corpora indexed', note: 'OISD, PESO, PNGRB, MoPNG, IOCL' },
  ];
  return (
    <section className="mx-auto max-w-7xl px-6 py-20">
      <div className="mx-auto max-w-3xl text-center">
        <Eyebrow>Targets</Eyebrow>
        <h2 className="mt-3 text-3xl font-bold leading-[1.1] text-navy md:text-5xl" style={{ letterSpacing: '-0.02em' }}>Engineered against numbers, not vibes.</h2>
      </div>
      <div className="mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-200/60 shadow-sm">
        {rows.map((r) => (
          <div key={r.v} className="p-7 bg-white">
            <div className="text-4xl font-bold text-navy" style={{ fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '-0.04em' }}>{r.k}</div>
            <div className="mt-2 text-sm font-semibold text-slate-700">{r.v}</div>
            <div className="mt-1 text-xs text-slate-400">{r.note}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Problem() {
  const items = [
    { t: 'Dense, table-heavy PDFs', d: "OISD-STD-144 alone spans 200+ pages with nested tables, annexures, and cross-references that standard search can't handle." },
    { t: 'Multiple overlapping standards', d: 'OISD, PESO, PNGRB, and MoPNG often cover the same topic. Knowing which applies — and which supersedes — requires expert knowledge.' },
    { t: 'No structured citations', d: 'A generic LLM answer without a clause and page number is useless for compliance sign-off.' },
    { t: 'Time pressure', d: 'Engineers need accurate answers in seconds, not the 15+ minutes spent hunting through PDFs during inspections or audits.' },
  ];
  return (
    <section className="mx-auto max-w-7xl px-6 py-20">
      <div className="mx-auto max-w-3xl text-center">
        <Eyebrow>The problem</Eyebrow>
        <h2 className="mt-3 text-3xl font-bold leading-[1.1] text-navy md:text-5xl" style={{ letterSpacing: '-0.02em' }}>Hundreds of pages. Seconds to decide.</h2>
      </div>
      <div className="mt-14 grid gap-5 md:grid-cols-2">
        {items.map((item, idx) => (
          <div key={item.t} className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-7 transition-all hover:border-orange/20 hover:shadow-lg hover:shadow-orange/5">
            <div className="absolute right-6 top-6 text-5xl font-extrabold text-orange/15 transition-colors duration-300 group-hover:text-orange/70" style={{ letterSpacing: '-0.02em' }}>{String(idx + 1).padStart(2, '0')}</div>
            <div className="relative z-10 pr-20">
              <h3 className="text-xl font-bold text-navy" style={{ letterSpacing: '-0.02em' }}>{item.t}</h3>
              <p className="mt-2 text-sm text-slate-500">{item.d}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Solution() {
  const items = [
    { t: 'RAG Pipeline', d: 'FAISS vector search over 300 DPI OCR-processed PDFs. Top-5 chunks retrieved per query with metadata-enriched section headers.', icon: <svg className="w-5 h-5 text-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg> },
    { t: 'Multi-corpus indexing', d: 'OISD, PESO, PNGRB T4S, MoPNG circulars, and IOCL Annual Reports all indexed and queryable in one place.', icon: <svg className="w-5 h-5 text-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg> },
    { t: 'Grounded generation', d: "Groq LLaMA 3 generates answers strictly from retrieved context. If no chunk matches, the bot refuses to guess.", icon: <svg className="w-5 h-5 text-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
    { t: 'Source citations', d: 'Every answer includes the source document, page number, and match confidence — ready for compliance sign-off.', icon: <svg className="w-5 h-5 text-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg> },
    { t: 'Metadata-enriched chunks', d: 'Section headers, document type, and page numbers preserved during chunking for precise retrieval.', icon: <svg className="w-5 h-5 text-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg> },
    { t: 'On-premise deployment', d: 'FAISS index built and served locally. No data leaves the network. Full compliance with IOCL data policies.', icon: <svg className="w-5 h-5 text-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" /></svg> },
  ];
  return (
    <section className="mx-auto max-w-7xl px-6 py-20">
      <div className="mx-auto max-w-3xl text-center">
        <Eyebrow>The solution</Eyebrow>
        <h2 className="mt-3 text-3xl font-bold leading-[1.1] text-navy md:text-5xl" style={{ letterSpacing: '-0.02em' }}>A RAG pipeline built around IOCL's documents.</h2>
      </div>
      <div className="mt-14 grid gap-5 md:grid-cols-3">
        {items.map((item) => (
          <div key={item.t} className="group rounded-[20px] border border-slate-200 bg-white p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-navy/5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-navy shadow-sm transition-all duration-300 group-hover:bg-orange">
              <div className="transition-all duration-500 ease-out group-hover:scale-[1.15] group-hover:-rotate-6 group-hover:[&>svg]:!text-white [&>svg]:transition-colors [&>svg]:duration-300">{item.icon}</div>
            </div>
            <h3 className="mt-5 text-lg font-bold text-navy" style={{ letterSpacing: '-0.02em' }}>{item.t}</h3>
            <p className="mt-2 text-sm text-slate-500 leading-relaxed">{item.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { step: '01', title: 'Ask in plain English', body: 'Type your compliance question — minimum distances, inspection intervals, pressure limits.' },
    { step: '02', title: 'Pipeline retrieves context', body: 'FAISS finds the top 5 relevant chunks from the indexed OISD, PESO, and MoPNG corpus.' },
    { step: '03', title: 'Grounded answer, cited', body: 'LLaMA 3 generates an answer strictly from retrieved context. Source document and page always included.' },
  ];
  return (
    <section className="mx-auto max-w-7xl px-6 py-20">
      <div className="mx-auto max-w-3xl text-center">
        <Eyebrow>How it works</Eyebrow>
        <h2 className="mt-3 text-3xl font-bold leading-[1.1] text-navy md:text-5xl" style={{ letterSpacing: '-0.02em' }}>From question to cited answer in under 10 seconds.</h2>
      </div>
      <div className="mt-14 grid md:grid-cols-3 gap-6">
        {steps.map((item) => (
          <div key={item.step} className="group rounded-2xl border border-slate-200 bg-white p-7 transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-navy/5">
            <span className="block mb-3 text-4xl font-extrabold text-navy/20 transition-colors duration-300 group-hover:text-orange/70" style={{ letterSpacing: '-0.02em' }}>{item.step}</span>
            <h3 className="font-bold text-navy text-base mb-2">{item.title}</h3>
            <p className="text-sm text-slate-500 leading-relaxed">{item.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function CTA({ navigate }) {
  return (
    <section className="mx-auto max-w-7xl px-6 py-20">
      <div className="relative overflow-hidden rounded-3xl bg-navy px-8 py-16 text-white md:px-16">
        <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-orange/30 blur-3xl" />
        <div className="absolute -bottom-24 -left-10 h-72 w-72 rounded-full bg-orange/10 blur-3xl" />
        <div className="relative grid items-center gap-10 md:grid-cols-[1.4fr_1fr]">
          <div>
            <h2 className="text-3xl font-bold leading-[1.1] md:text-5xl" style={{ letterSpacing: '-0.02em' }}>Built for IOCL. Grounded in OISD, PESO & MoPNG.</h2>
            <p className="mt-4 max-w-xl text-white/75">Answers never come from model training — only from the indexed corpus. Every response cites its source.</p>
          </div>
          <div className="flex flex-col gap-3">
            <button onClick={() => navigate('/chat')} className="rounded-full bg-orange px-5 py-3 text-center text-sm font-semibold text-white transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(243,112,33,0.5)] active:scale-[0.98]">Ask a question →</button>
            <button onClick={() => navigate('/admin')} className="rounded-full border border-white/20 px-5 py-3 text-center text-sm font-semibold text-white transition-all duration-300 hover:scale-[1.02] hover:bg-white/10 hover:border-white/40 active:scale-[0.98]">Admin panel</button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="mt-8 border-t border-slate-200 bg-navy text-white">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-6 py-14 md:grid-cols-3">
        <div className="md:col-span-2">
          <div className="flex items-center gap-4">
            <img src={logoWhite} alt="IOCL" className="h-10 w-auto" />
            <div>
              <div className="font-bold text-base">Indian Oil Corporation Limited</div>
              <div className="text-xs uppercase tracking-[0.18em] text-white/60">PolicyIQ</div>
            </div>
          </div>
          <p className="mt-5 max-w-md text-sm text-white/70">A RAG-based document intelligence chatbot over public OISD, PESO, PNGRB, and MoPNG regulatory documents. Built for accuracy. Engineered for compliance.</p>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-orange">Corpus</div>
          <ul className="mt-4 space-y-2 text-sm text-white/80">
            <li>OISD Standards</li>
            <li>PESO Regulations</li>
            <li>PNGRB T4S</li>
            <li>MoPNG Circulars</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-2 px-6 py-5 text-xs text-white/60 md:flex-row md:items-center">
          <div>&copy; {new Date().getFullYear()} Indian Oil Corporation Limited.</div>
          <div>PolicyIQ Internship Project.</div>
        </div>
      </div>
    </footer>
  );
}

function Nav({ navigate }) {
  return (
    <>
      <header className="fixed top-0 w-full z-50 border-b border-slate-200/60" style={{ background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}>
        <div className="mx-auto flex h-16 max-w-[1300px] items-center justify-between px-6">
          <div className="flex items-center gap-4 hover:opacity-90 transition-opacity cursor-pointer" onClick={() => navigate('/')}>
            <img src={logo} alt="IOCL" className="h-12 w-auto" />
            <div className="flex flex-col justify-center">
              <span className="text-[20px] font-bold text-[#1e2d78] leading-none tracking-tight">IndianOil</span>
              <span className="text-[10px] font-bold text-slate-400 tracking-[0.15em] uppercase mt-1 leading-none">PolicyIQ</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/admin')} className="rounded-md px-3 py-2 text-sm font-medium text-slate-500 hover:bg-white/60 hover:text-navy transition-colors">Admin</button>
            <button onClick={() => navigate('/chat')} className="inline-flex items-center gap-2 rounded-full bg-navy px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white transition-transform hover:scale-[1.02]">
              Open Chat <span className="text-orange">→</span>
            </button>
          </div>
        </div>
      </header>
      <div className="h-16 w-full" />
    </>
  );
}

// ── Rhino FAB ─────────────────────────────────────────────────────────────────
function RhinoFAB({ navigate }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {hovered && (
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-navy shadow-lg animate-fade-in">
          Open Chat →
        </div>
      )}
      <button
        onClick={() => navigate('/chat')}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="w-16 h-16 rounded-2xl shadow-2xl border border-slate-200 bg-white overflow-hidden transition-all duration-300 hover:scale-110 hover:shadow-[0_0_30px_rgba(243,112,33,0.4)]"
        title="Open Chat"
      >
        <video 
          src={rhinoVideo} 
          autoPlay 
          loop 
          muted 
          playsInline 
          disablePictureInPicture
          disableRemotePlayback
          className="pointer-events-none w-full h-full object-cover" 
          style={{ 
            filter: 'contrast(1.08) brightness(1.1)'
          }} 
        />
      </button>
    </div>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen font-sans relative bg-white overflow-x-hidden" style={{ color: '#1a1f36' }}>
      <Nav navigate={navigate} />
      <Hero navigate={navigate} />
      <Stats />
      <Problem />
      <Solution />
      <HowItWorks />
      <CTA navigate={navigate} />
      <Footer />
      <RhinoFAB navigate={navigate} />
    </div>
  );
}