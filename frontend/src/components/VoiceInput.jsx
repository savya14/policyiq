import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react'

const VoiceInput = forwardRef(({ onTranscript, onSpeechStart, onSpeechEnd }, ref) => {
  const [isListening, setIsListening] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  const [error, setError] = useState(null)
  const recognitionRef = useRef(null)

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    setIsSupported(!!SpeechRecognition)
  }, [])

  // Auto-clear error after 3 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [error])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
    }
  }, [])

  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition()
    
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-IN'
    recognition.maxAlternatives = 1

    recognition.onresult = (event) => {
      let currentTranscript = ''
      for (let i = 0; i < event.results.length; ++i) {
        currentTranscript += event.results[i][0].transcript
      }
      onTranscript(currentTranscript)
    }

    recognition.onend = () => {
      setIsListening(false)
      if (onSpeechEnd) onSpeechEnd()
    }

    recognition.onerror = (event) => {
      setIsListening(false)
      if (onSpeechEnd) onSpeechEnd()
      if (event.error === 'no-speech') {
        setError('No speech detected')
      } else if (event.error === 'not-allowed') {
        setError('Microphone access denied')
      } else {
        setError(`Error: ${event.error}`)
      }
    }

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
    setError(null)
    if (onSpeechStart) onSpeechStart()
  }

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }
    setIsListening(false)
    if (onSpeechEnd) onSpeechEnd()
  }

  useImperativeHandle(ref, () => ({
    stopListening
  }))

  const handleClick = () => {
    if (isListening) {
      stopListening()
    } else {
      startListening()
    }
  }

  return (
    <div className="voice-input-wrapper">
      <button
        onClick={handleClick}
        disabled={!isSupported}
        className={`mic-button w-8 h-8 flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-all ${isListening ? 'mic-listening text-white hover:text-white' : ''}`}
        title={
          !isSupported
            ? 'Voice input not supported in this browser'
            : isListening
            ? 'Click to stop listening'
            : 'Click to speak your query (en-IN)'
        }
        aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
        type="button"
      >
        {isListening ? (
          /* Stop icon */
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2"/>
          </svg>
        ) : (
          /* Mic icon */
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="2" width="6" height="11" rx="3"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
        )}
      </button>
      {error && (
        <div className="voice-error">
          {error}
        </div>
      )}
    </div>
  )
})

VoiceInput.displayName = 'VoiceInput'

export default VoiceInput
