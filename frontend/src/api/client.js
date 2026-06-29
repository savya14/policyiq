import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  timeout: 60000, // 60s — Groq can be slow on first cold query
})

// ── Chat ──────────────────────────────────────────────────────────────────────

export async function askQuestion(question, sessionId = null, chatHistory = [], language = "en") {
  console.log("=== API CLIENT ===");
  console.log("Language parameter received:", language);
  const body = { question, chat_history: chatHistory, language }
  if (sessionId) body.session_id = sessionId
  const { data } = await api.post('/ask', body)
  return data // { answer, session_id, source_documents, is_in_scope }
}

export async function submitFeedback(query, response, sources, is_positive) {
  const body = { query, response, sources, is_positive }
  const { data } = await api.post('/feedback', body)
  return data
}

export async function getPublicDocuments() {
  const { data } = await api.get('/documents')
  return data // { documents: [...] }
}

// ── Admin ─────────────────────────────────────────────────────────────────────

export async function adminLogin(password) {
  const { data } = await api.post('/admin/login', { password })
  return data // { token }
}

function authHeaders() {
  const token = localStorage.getItem('policyiq_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function getDocuments() {
  const { data } = await api.get('/admin/documents', { headers: authHeaders() })
  return data // { documents: [...] }
}

export async function uploadDocument(file, override = false) {
  const form = new FormData()
  form.append('file', file)
  const { data } = await api.post(`/admin/upload?override=${override}`, form, {
    headers: {
      ...authHeaders(),
      'Content-Type': 'multipart/form-data',
    },
  })
  return data // { success, message }
}

export async function deleteDocument(filename) {
  const { data } = await api.delete(
    `/admin/documents/${encodeURIComponent(filename)}`,
    { headers: authHeaders() },
  )
  return data // { success, message }
}

export async function getFeedbackLogs() {
  const { data } = await api.get('/admin/feedback', { headers: authHeaders() })
  return data // { feedbacks: [...] }
}

export async function deleteFeedbackAdmin(timestamp) {
  const { data } = await api.delete(
    `/admin/feedback?timestamp=${encodeURIComponent(timestamp)}`,
    { headers: authHeaders() }
  )
  return data
}

export async function translateAnswer(text) {
  const { data } = await api.post('/translate', { text })
  return data // { translated }
}
