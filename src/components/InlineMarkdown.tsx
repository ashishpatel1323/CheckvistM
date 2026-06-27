import { Platform } from 'react-native'
import { Text } from 'react-native'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

interface InlineMarkdownProps {
  content: string
  className?: string
}

// Web: sanitized inline HTML. Native: regex-parsed styled Text spans.
export function InlineMarkdown({ content, className }: InlineMarkdownProps) {
  const safe = typeof content === 'string' ? content : String(content ?? '')

  if (Platform.OS === 'web') {
    let html = ''
    try {
      html = DOMPurify.sanitize(marked.parseInline(safe) as string, {
        ALLOWED_TAGS: ['strong', 'em', 'code', 'del', 'a', 'span'],
        ALLOWED_ATTR: ['href', 'title'],
      })
    } catch {
      html = DOMPurify.sanitize(safe)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return <span className={className} {...{ dangerouslySetInnerHTML: { __html: html } } as any} />
  }

  return <Text className={className}>{parseInlineNative(safe)}</Text>
}

type Token = { type: 'text' | 'bold' | 'italic' | 'code' | 'del'; text: string }

function splitTokens(s: string): Token[] {
  const result: Token[] = []
  const re = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|~~(.+?)~~|__(.+?)__|_(.+?)_/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) result.push({ type: 'text', text: s.slice(last, m.index) })
    if (m[1] !== undefined) result.push({ type: 'bold', text: m[1] })
    else if (m[2] !== undefined) result.push({ type: 'italic', text: m[2] })
    else if (m[3] !== undefined) result.push({ type: 'code', text: m[3] })
    else if (m[4] !== undefined) result.push({ type: 'del', text: m[4] })
    else if (m[5] !== undefined) result.push({ type: 'bold', text: m[5] })
    else if (m[6] !== undefined) result.push({ type: 'italic', text: m[6] })
    last = m.index + m[0].length
  }
  if (last < s.length) result.push({ type: 'text', text: s.slice(last) })
  return result
}

function parseInlineNative(content: string): React.ReactNode[] {
  return splitTokens(content).map((part, i) => {
    if (part.type === 'bold') return <Text key={i} style={{ fontWeight: 'bold' }}>{part.text}</Text>
    if (part.type === 'italic') return <Text key={i} style={{ fontStyle: 'italic' }}>{part.text}</Text>
    if (part.type === 'code') return <Text key={i} style={{ fontFamily: 'monospace', backgroundColor: '#f3f4f6' }}>{part.text}</Text>
    if (part.type === 'del') return <Text key={i} style={{ textDecorationLine: 'line-through' }}>{part.text}</Text>
    return <Text key={i}>{part.text}</Text>
  })
}

// Plain-text fallback used in SVG <text> nodes
export function stripMarkdown(content: string): string {
  return content
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`(.+?)`/g, '$1')
}
