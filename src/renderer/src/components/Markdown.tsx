import { isValidElement, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import type { Concept } from '@shared/okf/types'
import { useStore } from '../store'

interface Props {
  concept: Concept
  onNavigate: (conceptId: string) => void
  onExternal: (url: string) => void
}

const isExternal = (h: string): boolean => /^[a-z][a-z0-9+.-]*:\/\//i.test(h) || h.startsWith('mailto:')

let mermaidId = 0

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children)
  return ''
}

export function Markdown({ concept, onNavigate, onExternal }: Props): JSX.Element {
  const linkByHref = new Map(concept.outgoing.map((l) => [l.href, l]))
  const theme = useStore((s) => s.theme)

  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          a({ href, children }) {
            const h = href ?? ''
            const link = linkByHref.get(h)
            if (link?.targetId) {
              return (
                <a
                  className="xlink internal"
                  href={h}
                  onClick={(e) => {
                    e.preventDefault()
                    onNavigate(link.targetId as string)
                  }}
                >
                  {children}
                </a>
              )
            }
            if (link?.broken) {
              return (
                <a
                  className="xlink broken"
                  href={h}
                  title="No matching concept in this bundle (may be not-yet-written knowledge)"
                  onClick={(e) => e.preventDefault()}
                >
                  {children}
                </a>
              )
            }
            return (
              <a
                className={`xlink ${isExternal(h) ? 'external' : 'internal'}`}
                href={h}
                onClick={(e) => {
                  e.preventDefault()
                  if (isExternal(h)) onExternal(h)
                }}
              >
                {children}
              </a>
            )
          },
          code({ className, children }) {
            const match = /language-(\w+)/.exec(className ?? '')
            const language = match?.[1]?.toLowerCase()
            const source = textOf(children).replace(/\n$/, '')
            if (language === 'mermaid') {
              return <MermaidDiagram source={source} theme={theme} />
            }
            return <code className={className}>{children}</code>
          }
        }}
      >
        {concept.body}
      </ReactMarkdown>
    </div>
  )
}

function MermaidDiagram({
  source,
  theme
}: {
  source: string
  theme: 'dark' | 'light'
}): JSX.Element {
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const id = useMemo(() => `mermaid-${++mermaidId}`, [])

  useEffect(() => {
    let cancelled = false

    setSvg(null)
    setError(null)

    void import('mermaid')
      .then(({ default: mermaid }) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: theme === 'dark' ? 'dark' : 'default'
        })
        return mermaid.render(id, source)
      })
      .then(({ svg }) => {
        if (!cancelled) setSvg(svg)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })

    return () => {
      cancelled = true
    }
  }, [id, source, theme])

  if (error) {
    return (
      <figure className="mermaid-block error">
        <figcaption>Mermaid diagram failed to render</figcaption>
        <pre>{source}</pre>
        <p>{error}</p>
      </figure>
    )
  }

  return (
    <figure className="mermaid-block">
      {svg ? (
        <div className="mermaid-svg" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div className="mermaid-loading">Rendering diagram...</div>
      )}
    </figure>
  )
}
