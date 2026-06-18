import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import type { Concept } from '@shared/okf/types'

interface Props {
  concept: Concept
  onNavigate: (conceptId: string) => void
  onExternal: (url: string) => void
}

const isExternal = (h: string): boolean => /^[a-z][a-z0-9+.-]*:\/\//i.test(h) || h.startsWith('mailto:')

export function Markdown({ concept, onNavigate, onExternal }: Props): JSX.Element {
  const linkByHref = new Map(concept.outgoing.map((l) => [l.href, l]))

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
          }
        }}
      >
        {concept.body}
      </ReactMarkdown>
    </div>
  )
}
