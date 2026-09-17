import { format } from 'date-fns'
import { parseMonthParams, parseYearParam } from './journalBooks'

const STATIC_LABELS: Record<string, string> = {
  '/': 'Journal',
  '/journal': 'Journal',
  '/journal/books': 'Shelf',
  '/journal/new': 'Entry',
  '/chat': 'Chat',
  '/context': 'Context',
  '/profile': 'Profile',
  '/insights': 'Insights',
  '/index': 'Index',
  '/settings': 'Settings',
}

/** The name a page is called by in "Back to …", from its pathname. */
export function labelForPath(pathname: string): string {
  const path = pathname.replace(/\/+$/, '') || '/'
  const fixed = STATIC_LABELS[path]
  if (fixed) return fixed

  const month = path.match(/^\/journal\/books\/(\d{4})\/(\d{1,2})$/)
  if (month) {
    const ref = parseMonthParams(month[1], month[2])
    if (ref) return format(new Date(ref.year, ref.month - 1, 1), 'MMMM yyyy')
  }
  const year = path.match(/^\/journal\/books\/(\d{4})$/)
  if (year) {
    const y = parseYearParam(year[1])
    if (y !== null) return String(y)
  }
  if (/^\/journal\/[^/]+$/.test(path)) return 'Entry'
  return 'previous page'
}
