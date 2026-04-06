import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { ThumbsUp, BookOpen, Clock } from 'lucide-react'
import { MoodDot } from '../ui/MoodDot'
import { Tag } from '../ui/Tag'
import type { JournalEntry } from '../../types/journal'

interface EntryCardProps {
  entry: JournalEntry
  index: number
}

export function EntryCard({ entry, index }: EntryCardProps) {
  const wordCount = entry.content.split(/\s+/).filter(Boolean).length
  const date = new Date(entry.createdAt)

  return (
    <Link
      to={`/journal/${entry.id}`}
      className="block no-underline"
      style={{
        animation: `cardIn 450ms ease-out ${80 + index * 80}ms both`,
      }}
    >
      <div
        className="relative overflow-hidden cursor-pointer"
        style={{
          background: 'var(--parchment)',
          border: '1px solid var(--stone)',
          borderRadius: 'var(--radius-md)',
          padding: '22px 26px',
          transition: 'all var(--transition-gentle)',
          boxShadow: '0 2px 8px var(--shadow-warm)',
        }}
        onMouseEnter={(e) => {
          const el = e.currentTarget
          el.style.boxShadow = '0 6px 22px var(--shadow-warm-hover)'
          el.style.transform = 'translateY(-2px)'
          el.style.borderColor = 'var(--sage)'
          const accent = el.querySelector<HTMLElement>('[data-accent]')
          if (accent) accent.style.background = 'var(--amber)'
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget
          el.style.boxShadow = '0 2px 8px var(--shadow-warm)'
          el.style.transform = 'translateY(0)'
          el.style.borderColor = 'var(--stone)'
          const accent = el.querySelector<HTMLElement>('[data-accent]')
          if (accent) accent.style.background = 'transparent'
        }}
      >
        {/* Left accent bar */}
        <div
          data-accent
          className="absolute left-0 top-0 bottom-0"
          style={{
            width: 3,
            background: 'transparent',
            transition: 'background var(--transition-gentle)',
            borderRadius: '0 2px 2px 0',
          }}
        />

        {/* Meta row */}
        <div className="flex items-center gap-2.5" style={{ marginBottom: 7 }}>
          <MoodDot mood={entry.mood} />
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--sage)', fontWeight: 500 }}>
            {format(date, 'd MMMM yyyy')}
          </span>
          <div className="flex gap-1.5 ml-auto">
            {entry.tags.map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
          </div>
        </div>

        {/* Title */}
        <div
          style={{
            fontFamily: 'var(--font-heading)',
            fontSize: 16.5,
            fontWeight: 500,
            color: 'var(--ink)',
            marginBottom: 6,
            letterSpacing: '-0.005em',
            lineHeight: 1.35,
          }}
        >
          {entry.title || 'Untitled'}
        </div>

        {/* Preview */}
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 13.5,
            color: 'var(--manuscript)',
            lineHeight: 1.65,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            opacity: 0.75,
          }}
        >
          {entry.content || 'No content yet...'}
        </div>

        {/* Footer */}
        <div
          className="flex items-center gap-4"
          style={{
            marginTop: 12,
            paddingTop: 10,
            borderTop: '1px solid rgba(212, 201, 184, 0.4)',
          }}
        >
          {entry.mood && (
            <span className="flex items-center gap-1" style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--sage)' }}>
              <ThumbsUp size={12} strokeWidth={1.8} />
              {entry.mood.value}/10
            </span>
          )}
          <span className="flex items-center gap-1" style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--sage)' }}>
            <BookOpen size={12} strokeWidth={1.8} />
            {wordCount} words
          </span>
          <span className="flex items-center gap-1" style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--sage)' }}>
            <Clock size={12} strokeWidth={1.8} />
            {format(date, 'h:mm a')}
          </span>
        </div>
      </div>
    </Link>
  )
}
