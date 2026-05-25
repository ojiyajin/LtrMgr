import { useParams, useNavigate } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { DocumentDetailContent } from '../components/DocumentDetailContent'

export function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  return (
    <Layout>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <DocumentDetailContent docId={id!} onClose={() => navigate('/documents')} />
      </div>
    </Layout>
  )
}
