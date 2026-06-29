import { useState } from 'react'

/**
 * DocumentTable
 * Props:
 *   documents  — array of { filename, chunks }
 *   onDelete   — async fn(filename) => void  called after successful deletion
 */
export default function DocumentTable({ documents, onDelete }) {
  // pendingDelete: filename currently showing the confirm row
  const [pendingDelete, setPendingDelete] = useState(null)
  // deletingRow: filename currently being deleted (spinner state)
  const [deletingRow, setDeletingRow] = useState(null)
  // rowError: { filename, message }
  const [rowError, setRowError] = useState(null)

  const handleDeleteClick = (filename) => {
    setRowError(null)
    setPendingDelete(filename)
  }

  const handleCancel = () => {
    setPendingDelete(null)
    setRowError(null)
  }

  const handleConfirm = async (filename) => {
    setPendingDelete(null)
    setDeletingRow(filename)
    setRowError(null)
    try {
      await onDelete(filename)
    } catch (err) {
      const msg =
        err?.response?.status === 404
          ? 'Document not found in the index.'
          : err?.response?.data?.detail || 'Deletion failed. Please try again.'
      setRowError({ filename, message: msg })
    } finally {
      setDeletingRow(null)
    }
  }

  if (!documents || documents.length === 0) {
    return (
      <div className="text-center py-10">
        <p className="text-sm text-slate-400">No documents indexed yet.</p>
        <p className="text-xs text-slate-300 mt-1">Upload a PDF above to get started.</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-100">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-100">
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Document
            </th>
            <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Chunks
            </th>
            <th className="px-4 py-3 w-10" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {documents.map((doc, i) => {
            const isDeleting = deletingRow === doc.filename
            const isPending = pendingDelete === doc.filename
            const hasError = rowError?.filename === doc.filename

            return (
              <>
                <tr
                  key={doc.filename}
                  className={`border-b border-slate-50 last:border-0 transition-colors ${
                    isDeleting ? 'opacity-40 pointer-events-none' : ''
                  } ${isPending ? 'bg-red-50/40' : i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}
                >
                  {/* Filename */}
                  <td className="px-4 py-3 font-medium text-navy truncate max-w-xs">
                    {doc.filename}
                  </td>

                  {/* Chunks */}
                  <td className="px-4 py-3 text-right text-slate-500 tabular-nums">
                    {isDeleting ? (
                      <span className="inline-block w-4 h-4 border-2 border-slate-300 border-t-navy rounded-full animate-spin" />
                    ) : (
                      doc.chunks ?? '—'
                    )}
                  </td>

                  {/* Delete trigger */}
                  <td className="px-4 py-3 text-right">
                    {!isDeleting && !isPending && (
                      <button
                        onClick={() => handleDeleteClick(doc.filename)}
                        aria-label={`Delete ${doc.filename}`}
                        className="text-slate-300 hover:text-red-500 transition-colors"
                        title="Remove from index"
                      >
                        {/* Trash icon */}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14H6L5 6" />
                          <path d="M10 11v6M14 11v6" />
                          <path d="M9 6V4h6v2" />
                        </svg>
                      </button>
                    )}
                  </td>
                </tr>

                {/* Inline confirm row */}
                {isPending && (
                  <tr key={`${doc.filename}-confirm`} className="bg-red-50 border-b border-red-100">
                    <td colSpan={3} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-xs text-red-700">
                          Remove <strong>{doc.filename}</strong> from the index and delete the raw PDF?
                          This cannot be undone.
                        </span>
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={handleCancel}
                            className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-slate-300 transition-all"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleConfirm(doc.filename)}
                            className="text-xs px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-all font-semibold"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}

                {/* Error row */}
                {hasError && (
                  <tr key={`${doc.filename}-error`} className="bg-red-50 border-b border-red-100">
                    <td colSpan={3} className="px-4 py-2">
                      <p className="text-xs text-red-600">{rowError.message}</p>
                    </td>
                  </tr>
                )}
              </>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
