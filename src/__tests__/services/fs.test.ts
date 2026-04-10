import { describe, it, expect } from 'vitest'
import { slugify, entryToMarkdown, parseMarkdown, extractDateFromFilename } from '../../services/fs'
import type { JournalEntry } from '../../types/journal'

function makeEntry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: 'test-id-123',
    title: 'My Test Entry',
    content: 'This is the body of the entry.',
    createdAt: '2026-04-07T09:00:00.000Z',
    updatedAt: '2026-04-07T09:30:00.000Z',
    mood: null,
    tags: [],
    summary: null,
    indexed: false,
    ...overrides,
  }
}

describe('slugify', () => {
  it('converts a normal title to a lowercase hyphenated slug', () => {
    /**
     * slugify is used to generate the filename for new journal entries on disk.
     * It converts a human-readable title like "My Morning Walk" to "my-morning-walk"
     * which is safe for use as a filesystem filename.
     * Input: title "My Morning Walk", id "fallback-id"
     * Expected output: "my-morning-walk"
     */
    expect(slugify('My Morning Walk', 'fallback-id')).toBe('my-morning-walk')
  })

  it('strips special characters and replaces them with hyphens', () => {
    /**
     * Special characters (punctuation, symbols) are not safe in filenames on all
     * operating systems. slugify strips them and collapses whitespace/punctuation
     * runs into a single hyphen.
     * Input: title "Hello, World! Today's entry."
     * Expected output: "hello-world-today-s-entry" (apostrophe becomes hyphen, trailing dot stripped)
     */
    const result = slugify("Hello, World! Today's entry.", 'fallback-id')
    expect(result).toBe('hello-world-today-s-entry')
  })

  it('strips leading and trailing hyphens', () => {
    /**
     * If the title starts or ends with special characters that get replaced by
     * hyphens, the leading/trailing hyphens must be removed so filenames don't
     * start with "-" (which could be confused with a command-line flag).
     * Input: title "---hello---"
     * Expected output: "hello"
     */
    expect(slugify('---hello---', 'fallback-id')).toBe('hello')
  })

  it('falls back to the id when the title produces an empty slug', () => {
    /**
     * If a title contains only special characters, the slug would be empty after
     * sanitisation. In this case, the entry's UUID is used as the filename to
     * ensure every entry still gets a valid, unique file path.
     * Input: title "!!!", id "abc-123"
     * Expected output: "abc-123"
     */
    expect(slugify('!!!', 'abc-123')).toBe('abc-123')
  })

  it('lowercases the entire slug', () => {
    /**
     * File systems like macOS (case-insensitive by default) and Linux (case-sensitive)
     * can behave differently with mixed-case filenames. Lowercasing ensures
     * consistent, predictable filenames across platforms.
     * Input: title "LOUD TITLE"
     * Expected output: "loud-title"
     */
    expect(slugify('LOUD TITLE', 'fallback-id')).toBe('loud-title')
  })
})

describe('entryToMarkdown', () => {
  it('produces a markdown document with YAML frontmatter and content', () => {
    /**
     * entryToMarkdown serialises a JournalEntry to the on-disk .md format.
     * The output must begin with a YAML frontmatter block (---) followed by
     * the entry content. This format is read back by parseMarkdown.
     * Input: a basic entry with id, title, dates, tags, content
     * Expected output: string starting with "---\n" and containing the content
     */
    const entry = makeEntry()
    const md = entryToMarkdown(entry)
    expect(md.startsWith('---\n')).toBe(true)
    expect(md).toContain('This is the body of the entry.')
  })

  it('includes all required frontmatter fields', () => {
    /**
     * The frontmatter must contain the fields that loadEntriesFromDisk uses to
     * reconstruct a JournalEntry: id, title, createdAt, updatedAt, tags, indexed.
     * Missing fields would cause data loss on the next sync from disk.
     * Input: an entry with all fields populated
     * Expected output: frontmatter contains "id", "title", "createdAt", "updatedAt", "tags", "indexed"
     */
    const entry = makeEntry({ tags: ['work'], indexed: true })
    const md = entryToMarkdown(entry)
    expect(md).toContain('id:')
    expect(md).toContain('title:')
    expect(md).toContain('createdAt:')
    expect(md).toContain('updatedAt:')
    expect(md).toContain('tags:')
    expect(md).toContain('indexed:')
  })

  it('includes mood in frontmatter when present', () => {
    /**
     * The mood field is optional on JournalEntry (null when unindexed). When it
     * is set, it must be serialised to frontmatter so the mood score survives
     * a round-trip to disk and back without loss.
     * Input: entry with mood { value: 8, label: "great" }
     * Expected output: frontmatter contains "mood"
     */
    const entry = makeEntry({ mood: { value: 8, label: 'great' } })
    const md = entryToMarkdown(entry)
    expect(md).toContain('mood:')
  })

  it('omits mood from frontmatter when null', () => {
    /**
     * When mood is null (entry not yet indexed), the mood key should not appear
     * in the frontmatter at all. This keeps the .md file clean and avoids
     * parseMarkdown having to deal with a "mood: null" value.
     * Input: entry with mood: null
     * Expected output: frontmatter does NOT contain "mood"
     */
    const entry = makeEntry({ mood: null })
    const md = entryToMarkdown(entry)
    const lines = md.split('\n')
    const hasMoodLine = lines.some((l) => l.startsWith('mood:'))
    expect(hasMoodLine).toBe(false)
  })

  it('includes summary in frontmatter when present', () => {
    /**
     * The AI-generated summary is stored in frontmatter so it persists on disk
     * and is available immediately when entries are loaded, without needing to
     * re-run the AI indexing pipeline.
     * Input: entry with summary "A productive day."
     * Expected output: frontmatter contains "summary"
     */
    const entry = makeEntry({ summary: 'A productive day.' })
    const md = entryToMarkdown(entry)
    expect(md).toContain('summary:')
  })
})

describe('parseMarkdown', () => {
  it('extracts frontmatter and content from a valid markdown document', () => {
    /**
     * parseMarkdown is the inverse of entryToMarkdown. It splits a .md file
     * into its frontmatter key-value pairs and the body content. This is used
     * by loadEntriesFromDisk to reconstruct JournalEntry objects from files.
     * Input: a markdown string with YAML frontmatter and body content
     * Expected output: frontmatter object with parsed keys, content as the body
     */
    const md = `---\ntitle: "My Entry"\nindexed: false\n---\n\nHello world.`
    const { frontmatter, content } = parseMarkdown(md)
    expect(frontmatter.title).toBe('My Entry')
    expect(frontmatter.indexed).toBe(false)
    expect(content).toBe('Hello world.')
  })

  it('returns empty frontmatter and the full text for a plain markdown file', () => {
    /**
     * Plain markdown files imported from outside nopy (e.g. Obsidian exports)
     * will not have a frontmatter block. parseMarkdown must handle this gracefully
     * by returning an empty frontmatter object and treating the entire file as content.
     * Input: a plain markdown string with no --- delimiters
     * Expected output: frontmatter === {}, content === the full input string
     */
    const plain = '# Just a heading\n\nSome content here.'
    const { frontmatter, content } = parseMarkdown(plain)
    expect(Object.keys(frontmatter)).toHaveLength(0)
    expect(content).toBe(plain)
  })

  it('round-trips with entryToMarkdown without data loss', () => {
    /**
     * The most important property of the serialisation pair is that writing an
     * entry to markdown and reading it back produces the same data. This test
     * verifies the full round-trip for core fields: id, title, tags, indexed.
     * Input: a JournalEntry serialised via entryToMarkdown then parsed via parseMarkdown
     * Expected output: frontmatter contains the original field values unchanged
     */
    const entry = makeEntry({
      id: 'round-trip-id',
      title: 'Round Trip',
      tags: ['test', 'round-trip'],
      indexed: true,
    })
    const md = entryToMarkdown(entry)
    const { frontmatter, content } = parseMarkdown(md)
    expect(frontmatter.id).toBe('round-trip-id')
    expect(frontmatter.title).toBe('Round Trip')
    expect(frontmatter.tags).toEqual(['test', 'round-trip'])
    expect(frontmatter.indexed).toBe(true)
    expect(content).toBe('This is the body of the entry.')
  })

  it('falls back gracefully on a malformed JSON value in frontmatter', () => {
    /**
     * Not all .md files written by nopy will have perfectly valid JSON values in
     * their frontmatter (e.g. corruption, manual edits). parseMarkdown catches
     * JSON.parse errors and stores the raw string value instead of crashing.
     * Input: frontmatter with a key whose value is unquoted and not valid JSON
     * Expected output: successful parse, with the raw string stored for that key
     */
    const md = `---\ntitle: unquoted value\nindexed: false\n---\n\nContent.`
    const { frontmatter, content } = parseMarkdown(md)
    expect(frontmatter.title).toBe('unquoted value')
    expect(content).toBe('Content.')
  })
})

describe('extractDateFromFilename', () => {
  it('extracts an ISO date from a filename with a YYYY-MM-DD prefix', () => {
    /**
     * Plain markdown files imported from date-prefixed journaling apps (e.g. Day One
     * exports, Obsidian daily notes) often have filenames like "2026-04-07.md".
     * extractDateFromFilename pulls the date out so the entry gets a sensible
     * createdAt timestamp rather than defaulting to now.
     * Input: "2026-04-07.md"
     * Expected output: an ISO string containing "2026-04-07"
     */
    const result = extractDateFromFilename('2026-04-07.md')
    expect(result).not.toBeNull()
    expect(result).toContain('2026-04-07')
  })

  it('extracts the date from a filename with text after the date', () => {
    /**
     * Filenames like "2026-04-07-morning-light.md" are common in daily note systems.
     * The function should extract the date portion regardless of what follows it,
     * using a regex that matches the first YYYY-MM-DD segment.
     * Input: "2026-04-07-morning-light.md"
     * Expected output: ISO string containing "2026-04-07"
     */
    const result = extractDateFromFilename('2026-04-07-morning-light.md')
    expect(result).not.toBeNull()
    expect(result).toContain('2026-04-07')
  })

  it('returns null for a filename with no date', () => {
    /**
     * Many imported files will not have a date in the filename at all (e.g. topic-based
     * notes like "anxiety-thoughts.md"). The function must return null in this case
     * so the caller knows to fall back to the current timestamp.
     * Input: "anxiety-thoughts.md"
     * Expected output: null
     */
    const result = extractDateFromFilename('anxiety-thoughts.md')
    expect(result).toBeNull()
  })

  it('returns null for a filename with no recognisable YYYY-MM-DD pattern', () => {
    /**
     * Files whose names contain only partial numeric sequences (e.g. version numbers
     * like "v1-2-3-notes.md") should not match the date regex and must return null.
     * Note: JavaScript's Date constructor overflows out-of-range month/day values
     * (e.g. month 13 becomes month 1 of the next year), so there is no truly
     * "invalid" YYYY-MM-DD-formatted date from extractDateFromFilename's perspective.
     * The correct guard is the regex not matching at all.
     * Input: "v1-2-notes.md" (no four-digit year)
     * Expected output: null
     */
    const result = extractDateFromFilename('v1-2-notes.md')
    expect(result).toBeNull()
  })

  it('returns an ISO string (not null) for a valid date filename', () => {
    /**
     * The return value when a valid date is found should be a proper ISO 8601 string
     * (i.e. parseable by new Date()). This ensures it can be stored directly in
     * JournalEntry.createdAt without further conversion.
     * Input: "2025-01-15-entry.md"
     * Expected output: a non-null string that new Date() can parse without returning NaN
     */
    const result = extractDateFromFilename('2025-01-15-entry.md')
    expect(result).not.toBeNull()
    expect(isNaN(new Date(result!).getTime())).toBe(false)
  })
})
