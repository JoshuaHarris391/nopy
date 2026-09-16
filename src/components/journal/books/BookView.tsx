import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { MainHeader } from '../../ui/MainHeader'
import { useMediaQuery } from '../../../hooks/useMediaQuery'
import { useJournalIndex } from '../../../hooks/useJournalIndex'
import { useEnsureEntriesLoaded } from '../../../hooks/useEnsureEntriesLoaded'
import {
  getMonthEntries, monthKey, monthLabel, monthPath,
  parseMonthParams, parseYearParam, resolveMonthInYear,
} from '../../../services/journalBooks'
import { Breadcrumb, type Crumb } from './Breadcrumb'
import { MonthTabs } from './MonthTabs'
import { MonthScroll } from './MonthScroll'
import { JournalHeaderActions } from './JournalHeaderActions'

/**
 * An open book: breadcrumb in the header, the month thumb-index, and the
 * selected month's scroll. `/journal/books/:year` without a month resolves
 * to that year's latest written month.
 */
export function BookView() {
  const { year: yearParam, month: monthParam } = useParams<{ year: string; month?: string }>()
  const navigate = useNavigate()
  const loaded = useEnsureEntriesLoaded()
  const index = useJournalIndex()
  const wide = useMediaQuery('(min-width: 1024px)')
  const year = parseYearParam(yearParam)

  if (year === null) return <Navigate to="/journal" replace />

  if (monthParam === undefined) {
    if (!loaded) return null
    return <Navigate to={monthPath({ year, month: resolveMonthInYear(index, year) })} replace />
  }

  const ref = parseMonthParams(yearParam, monthParam)
  if (!ref) return <Navigate to="/journal" replace />

  const book = index.bookByYear.get(year)
  const entries = getMonthEntries(index, ref)
  const now = new Date()
  const isCurrentYear = year === now.getFullYear()
  const isCurrentMonth = isCurrentYear && ref.month === now.getMonth() + 1

  const crumbs: Crumb[] = [
    { label: 'Shelf', to: '/journal/books' },
    { label: String(year), to: `/journal/books/${year}` },
    { label: monthLabel(ref.month) },
  ]
  const tabs = (orientation: 'vertical' | 'horizontal') => (
    <MonthTabs
      year={year}
      months={book?.months ?? []}
      selected={ref.month}
      today={isCurrentYear ? now.getMonth() + 1 : null}
      orientation={orientation}
      onSelect={(m) => navigate(monthPath({ year, month: m }))}
    />
  )

  return (
    <>
      <MainHeader leading={<Breadcrumb crumbs={crumbs} />}>
        <JournalHeaderActions />
      </MainHeader>
      {!wide && tabs('horizontal')}
      <div className="flex-1 flex min-h-0">
        <MonthScroll
          key={monthKey(ref)}
          month={ref}
          entries={entries}
          isCurrentMonth={isCurrentMonth}
          journalEmpty={loaded && index.total === 0}
          onNewEntry={() => navigate('/journal/new')}
        />
        {wide && tabs('vertical')}
      </div>
    </>
  )
}
