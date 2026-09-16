import { useNavigate } from 'react-router-dom'
import { BookOpen, Plus } from 'lucide-react'
import { MainHeader } from '../../ui/MainHeader'
import { Button } from '../../ui/Button'
import { EmptyState } from '../../ui/EmptyState'
import { useMediaQuery } from '../../../hooks/useMediaQuery'
import { useJournalIndex } from '../../../hooks/useJournalIndex'
import { useEnsureEntriesLoaded } from '../../../hooks/useEnsureEntriesLoaded'
import { BookCover, COVER_W } from './BookCover'
import { JournalHeaderActions } from './JournalHeaderActions'

/** The shelf: one cloth-bound book per year that has entries, newest first. */
export function BookshelfView() {
  const navigate = useNavigate()
  const loaded = useEnsureEntriesLoaded()
  const index = useJournalIndex()
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const books = index.books
  const years = books.length

  return (
    <>
      <MainHeader title="Journal">
        <JournalHeaderActions />
      </MainHeader>
      <div className="flex-1 overflow-y-auto" style={{ padding: '36px 44px' }}>
        <div className="flex items-baseline" style={{ gap: 10, marginBottom: 28 }}>
          <h1 style={{ fontFamily: 'var(--font-title)', fontSize: 26, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.01em', lineHeight: 1.2, margin: 0 }}>
            Shelf
          </h1>
          {years > 0 && (
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--sage)' }}>
              · {years} {years === 1 ? 'year' : 'years'} · {index.total.toLocaleString()} {index.total === 1 ? 'entry' : 'entries'}
            </span>
          )}
        </div>

        {loaded && years === 0 ? (
          <EmptyState
            icon={<BookOpen size={48} strokeWidth={1.2} />}
            title="Your journal awaits"
            description="Start your first entry to begin building a record of your inner world."
            action={
              <Button onClick={() => navigate('/journal/new')}>
                <Plus size={14} strokeWidth={2} />
                Write your first entry
              </Button>
            }
          />
        ) : (
          <div
            className="grid"
            style={{ gridTemplateColumns: `repeat(auto-fill, ${COVER_W + 24}px)`, rowGap: 36, columnGap: 0 }}
          >
            {books.map((book, i) => (
              // The stagger lives on this wrapper, not the button: cardIn's
              // `both` fill would otherwise pin the cover's transform and kill
              // the hover tilt. Adjacent cells' bottom rules form one shelf.
              <div
                key={book.year}
                style={{
                  padding: '0 12px 14px',
                  borderBottom: '1px solid var(--stone)',
                  animation: `cardIn 450ms ease-out ${reducedMotion ? 0 : 80 + Math.min(i, 8) * 60}ms both`,
                }}
              >
                <BookCover year={book.year} count={book.count} onOpen={() => navigate(`/journal/books/${book.year}`)} />
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
