import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { getFileContent } from '../api/documents'
import { preprocessMath } from '../utils/mathPreprocess'

interface Props {
  docId: string
  fileId: string
}

export function MarkdownViewer({ docId, fileId }: Props) {
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    getFileContent(docId, fileId)
      .then((text) => setContent(text))
      .catch(() => setError(true))
  }, [docId, fileId])

  if (error) {
    return <p style={{ color: 'var(--red)', fontSize: 13 }}>Markdown の読み込みに失敗しました</p>
  }
  if (content === null) {
    return <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>読み込み中...</p>
  }

  return (
    <div className="markdown-viewer">
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false }]]}
      >
        {preprocessMath(content)}
      </ReactMarkdown>
    </div>
  )
}
