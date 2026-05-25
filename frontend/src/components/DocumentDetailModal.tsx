import { DocumentDetailContent } from './DocumentDetailContent'

export function DocumentDetailModal({ docId, onClose }: { docId: string; onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="doc-detail-modal-box" onClick={(e) => e.stopPropagation()}>
        <DocumentDetailContent docId={docId} onClose={onClose} />
      </div>
    </div>
  )
}
