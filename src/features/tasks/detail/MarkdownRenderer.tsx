import { useMemo } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

interface MarkdownRendererProps {
  content: string
  className?: string
}

export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  const html = useMemo(() => {
    if (!content) return ''
    const raw = String(marked.parse(content))
    return DOMPurify.sanitize(raw)
  }, [content])

  return (
    <div
      className={`prose prose-sm max-w-none text-gray-700 ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
