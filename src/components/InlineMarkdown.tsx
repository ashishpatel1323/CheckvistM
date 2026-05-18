import { marked } from 'marked'
import DOMPurify from 'dompurify'

interface InlineMarkdownProps {
  content: string
  className?: string
}

// Renders inline markdown (bold, italic, code, strikethrough) as sanitized HTML.
// Does NOT produce block elements — safe for use inside <span> / <li> / <td>.
export function InlineMarkdown({ content, className }: InlineMarkdownProps) {
  const html = DOMPurify.sanitize(marked.parseInline(content) as string, {
    ALLOWED_TAGS: ['strong', 'em', 'code', 'del', 'a', 'span'],
    ALLOWED_ATTR: ['href', 'title'],
  })
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />
}

// Plain text version: strips markdown markers. Used where HTML cannot be rendered (SVG text).
export function stripMarkdown(content: string): string {
  return content
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`(.+?)`/g, '$1')
}
