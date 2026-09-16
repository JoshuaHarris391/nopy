import { useState } from 'react'
import { coverThemeForYear } from './coverPalette'
import markInk from '../../../assets/nopy_logo_v2_detail.png'
import markCream from '../../../assets/nopy_logo_v2_detail_white.png'

export const COVER_W = 150
export const COVER_H = 210
const SPINE_W = 14

interface BookCoverProps {
  year: number
  count: number
  onOpen: () => void
}

/**
 * A cloth-bound board book. The warmth comes from the materials only: cloth
 * colour and weave, the debossed year in the title serif, a glued-on paper
 * label, and the nopy mark blind-stamped as a colophon. Sharp corners because
 * it is a container, not something the hand holds.
 */
export function BookCover({ year, count, onOpen }: BookCoverProps) {
  const t = coverThemeForYear(year)
  const [hovered, setHovered] = useState(false)
  const label = `${count.toLocaleString()} ${count === 1 ? 'entry' : 'entries'}`
  // Board edge plus a top-left highlight, always under the elevation shadow.
  const edge = 'inset 0 0 0 1px rgba(44,62,44,0.14), inset 1px 1px 0 rgba(245,240,232,0.12)'

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${year}, ${label}`}
      className="nopy-focus relative block cursor-pointer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: COVER_W, height: COVER_H, padding: 0, border: 'none', borderRadius: 0,
        overflow: 'hidden', textAlign: 'center',
        backgroundColor: t.cloth,
        // Cloth weave: two crossed hairline gradients at 3px pitch. The global
        // paper grain overlay adds the tooth on top.
        backgroundImage: [
          'repeating-linear-gradient(0deg, rgba(245,240,232,0.05) 0 1px, transparent 1px 3px)',
          'repeating-linear-gradient(90deg, rgba(44,62,44,0.06) 0 1px, transparent 1px 3px)',
        ].join(', '),
        boxShadow: hovered ? `0 10px 26px var(--shadow-warm-hover), ${edge}` : `0 2px 8px var(--shadow-warm), ${edge}`,
        // Negative rotateY brings the fore-edge toward the reader; hinge on the spine.
        transform: hovered
          ? 'perspective(700px) rotateY(-4deg) translateY(-3px)'
          : 'perspective(700px) rotateY(0deg) translateY(0)',
        transformOrigin: 'left center',
        transition: 'transform var(--transition-gentle), box-shadow var(--transition-gentle)',
      }}
    >
      {/* Spine band: darker cloth, hinge groove on its right, hairline highlight on its left */}
      <div
        aria-hidden
        className="absolute left-0 top-0 bottom-0"
        style={{
          width: SPINE_W, background: t.spine,
          boxShadow: 'inset -1px 0 0 rgba(44,62,44,0.22), inset 1px 0 0 rgba(245,240,232,0.10)',
        }}
      />

      {/* Night dimming: transparent in light mode, a cool wash in dark mode */}
      <div aria-hidden className="absolute inset-0" style={{ background: 'var(--cover-dim)', pointerEvents: 'none' }} />

      {/* Debossed year */}
      <div
        aria-hidden
        className="absolute"
        style={{
          left: SPINE_W, right: 0, top: 54,
          fontFamily: 'var(--font-title)', fontSize: 44, fontWeight: 700, lineHeight: 1,
          letterSpacing: '-0.02em', color: t.text, textShadow: t.deboss,
          fontFeatureSettings: '"lnum" 1',
        }}
      >
        {year}
      </div>

      {/* Paper label, glued on */}
      <div
        aria-hidden
        className="absolute"
        style={{
          left: SPINE_W + 24, right: 24, top: 120, padding: '3px 6px',
          background: 'var(--cloth-cream)', border: '1px solid rgba(44,62,44,0.22)',
          boxShadow: '0 1px 1px rgba(44,62,44,0.18)',
          fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 500, letterSpacing: '0.02em',
          color: 'var(--cloth-ink)', whiteSpace: 'nowrap',
        }}
      >
        {label}
      </div>

      {/* Colophon: the mark, blind-stamped */}
      <img
        aria-hidden
        alt=""
        src={t.tone === 'light' ? markCream : markInk}
        className="absolute"
        style={{
          left: SPINE_W + (COVER_W - SPINE_W) / 2 - 11, bottom: 18,
          width: 22, height: 22, objectFit: 'contain', opacity: 0.55,
        }}
      />
    </button>
  )
}
