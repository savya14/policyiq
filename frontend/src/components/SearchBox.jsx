import { useState, useRef, useEffect } from 'react'
import questionsData from '../data/questions.json'
import VoiceInput from './VoiceInput'
import { AnimatePresence, motion } from 'framer-motion'

const highlightMatch = (text, query) => {
  if (!query.trim()) return <span style={{ opacity: 0.45 }}>{text}</span>
  
  const searchTerms = query.trim().split(/\s+/).filter(Boolean).map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (searchTerms.length === 0) return <span style={{ opacity: 0.45 }}>{text}</span>
  
  const regex = new RegExp(`\\b(${searchTerms.join('|')})`, 'gi')
  const parts = text.split(regex)
  
  return (
    <>
      {parts.map((part, i) => {
        const isMatch = searchTerms.some(term => new RegExp(`^${term}$`, 'i').test(part))
        if (isMatch) {
          return <span key={i} style={{ fontWeight: 600, opacity: 1 }}>{part}</span>
        } else {
          return <span key={i} style={{ opacity: 0.45 }}>{part}</span>
        }
      })}
    </>
  )
}

const SearchBox = ({ value, onChange, onSubmit, disabled, placeholder }) => {
  const containerRef = useRef(null)
  const inputRef = useRef(null)
  const voiceInputRef = useRef(null)
  const valueAtSpeechStartRef = useRef('')

  const [suggestions, setSuggestions] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [activeSuggestion, setActiveSuggestion] = useState(-1)

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowDropdown(false)
        setActiveSuggestion(-1)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    // Automatically focus the input whenever it becomes enabled (e.g., after loading)
    if (!disabled && inputRef.current) {
      inputRef.current.focus()
    }
  }, [disabled])

  const handleChange = (e) => {
    onChange(e)
    const val = e.target.value.trim().toLowerCase()
    if (val.length >= 2) {
      const searchTerms = val.split(/\s+/).filter(Boolean).map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      const results = questionsData
        .filter(q => searchTerms.every(term => new RegExp(`\\b${term}`, 'i').test(q)))
        .slice(0, 5)
      setSuggestions(results)
      setShowDropdown(results.length > 0)
      setActiveSuggestion(-1)
    } else {
      setShowDropdown(false)
      setSuggestions([])
    }
  }

  const handleSearchSubmit = (val) => {
    if (voiceInputRef.current) {
      voiceInputRef.current.stopListening()
    }
    onSubmit(val)
  }

  const handleSuggestionSelect = (suggestion) => {
    onChange({ target: { value: suggestion } })
    setShowDropdown(false)
    setActiveSuggestion(-1)
    setSuggestions([])
    if (inputRef.current) inputRef.current.focus()
    handleSearchSubmit(suggestion)
  }

  const handleSpeechStart = () => {
    valueAtSpeechStartRef.current = value || ''
  }

  const handleTranscript = (transcript) => {
    const base = valueAtSpeechStartRef.current
    const newValue = base ? `${base} ${transcript}` : transcript
    onChange({ target: { value: newValue } })
    if (inputRef.current) inputRef.current.focus()
  }

  const handleKeyDown = (e) => {
    if (!showDropdown) {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleSearchSubmit(value)
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveSuggestion(prev => Math.min(prev + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveSuggestion(prev => Math.max(prev - 1, -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeSuggestion >= 0) {
        handleSuggestionSelect(suggestions[activeSuggestion])
      } else {
        handleSearchSubmit(value)
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false)
      setActiveSuggestion(-1)
    } else if (e.key === 'Tab' && suggestions.length > 0) {
      e.preventDefault()
      handleSuggestionSelect(suggestions[0])
    }
  }

  return (
    <div ref={containerRef} className="searchbox-container relative w-full">
      {/* Floating Autocomplete Dropdown */}
      <AnimatePresence>
        {showDropdown && suggestions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute bottom-[calc(100%+12px)] left-0 w-full bg-white border border-slate-200 rounded-2xl shadow-[0_-4px_20px_rgba(0,0,0,0.05)] overflow-hidden z-30"
          >
            <ul className="suggestions-dropdown py-1">
              {suggestions.map((suggestion, index) => (
                <li
                  key={index}
                  className={`suggestion-item flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${index === activeSuggestion ? 'bg-blue-50/60 border-l-2 border-blue-500' : 'hover:bg-slate-50 border-l-2 border-transparent'}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSuggestionSelect(suggestion)}
                >
                  <span className={`suggestion-icon flex-shrink-0 transition-colors ${index === activeSuggestion ? 'text-blue-500' : 'text-slate-400'}`}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                  </span>
                  <span className="suggestion-text text-sm text-slate-700 truncate">{highlightMatch(suggestion, value)}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input Field */}
      <div className="searchbox-input-row bg-white border border-slate-200 rounded-2xl shadow-sm flex items-center gap-2 w-full p-2 relative z-20">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder || "Ask about OISD, PESO, PNGRB regulations..."}
          className="chat-input flex-1 resize-none bg-transparent border-none focus:ring-0 outline-none px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 disabled:opacity-50"
          autoComplete="off"
          autoFocus={true}
        />
        <VoiceInput ref={voiceInputRef} onTranscript={handleTranscript} onSpeechStart={handleSpeechStart} />
        <button
          onClick={() => handleSearchSubmit(value)}
          disabled={disabled || !value.trim()}
          className="send-button bg-navy text-white w-10 h-10 rounded-xl flex items-center justify-center disabled:opacity-40 hover:bg-navy-light transition-all duration-200 hover:scale-105 active:scale-95 flex-shrink-0"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  )
}

export default SearchBox
