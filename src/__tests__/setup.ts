import '@testing-library/jest-dom/vitest'

// jsdom doesn't implement matchMedia, but components that adapt to the OS theme
// (Sidebar, JournalLauncher) call it on mount. Provide a minimal stub that
// reports "light" so those components render in tests without throwing.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })
}
