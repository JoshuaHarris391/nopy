import { Link } from 'react-router-dom'

export interface Crumb {
  label: string
  /** Omit on the current crumb. */
  to?: string
}

const crumbFont: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontSize: 20, letterSpacing: '-0.01em', lineHeight: 1,
}

/**
 * Shelf › 2026 › September. Replaces the page title in MainHeader. The
 * separator is the typographic "›" in the display face, not an icon.
 */
export function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" style={{ minWidth: 0 }}>
      <ol className="flex items-center" style={{ gap: 8, listStyle: 'none', margin: 0, padding: 0 }}>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1
          return (
            <li key={`${c.label}-${i}`} className="flex items-center" style={{ gap: 8 }}>
              {i > 0 && <span aria-hidden style={{ ...crumbFont, fontWeight: 400, color: 'var(--stone)' }}>›</span>}
              {last || !c.to ? (
                <span aria-current={last ? 'page' : undefined} style={{ ...crumbFont, fontWeight: 700, color: 'var(--ink)' }}>
                  {c.label}
                </span>
              ) : (
                <Link
                  to={c.to}
                  className="nopy-focus no-underline"
                  style={{
                    ...crumbFont, fontWeight: 500, color: 'var(--sage)',
                    padding: '2px 2px', borderRadius: 'var(--radius-sm)',
                    transition: 'color var(--transition-fast)',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--forest)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--sage)')}
                >
                  {c.label}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
