import { Platform } from 'react-native'
import { useMemo } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { Text } from 'react-native'
import { stripMarkdown } from '@/components/InlineMarkdown'

interface MarkdownRendererProps {
  content: string
  className?: string
}

export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  const html = useMemo(() => {
    if (!content || Platform.OS !== 'web') return ''
    const raw = String(marked.parse(content))
    return DOMPurify.sanitize(raw)
  }, [content])

  if (Platform.OS === 'web') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return <div className={`prose prose-sm max-w-none text-gray-700 ${className}`} {...{ dangerouslySetInnerHTML: { __html: html } } as any} />
  }

  // Native: render as plain text with stripped markdown
  return <Text className={`text-sm text-gray-700 ${className}`}>{stripMarkdown(content)}</Text>
}
