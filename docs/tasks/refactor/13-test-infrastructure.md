# 13 — Set Up Test Infrastructure for Hooks, Components, and Stores

## Problem

The existing Vitest suite covers the pure-logic layer well (schemas, `computeLocalStats`, `assembleContext`, `slugify`, etc.) but runs in a **Node environment** with no DOM. This means:

- **React hooks** cannot be tested — `renderHook` from `@testing-library/react` requires a DOM.
- **React components** cannot be tested — `render` from `@testing-library/react` requires a DOM.
- **Zustand stores** _can_ be tested in Node (they don't need a DOM), but there is no test harness or pattern for it.

Most of the refactor tasks (01, 02, 05, 06, 07, 09, 11) introduce new hooks, store actions, or components that need tests. This task sets up the infrastructure so those tests can be written.

This task must land **before** any task that needs hook, component, or store tests.

## Current Behaviour

### `vitest.config.ts`

```typescript
// Current — no environment specified (defaults to 'node')
export default defineConfig({
  // ...
})
```

### `package.json` devDependencies

No `@testing-library/react`, no `@testing-library/dom`, no `@testing-library/jest-dom`, no `jsdom`.

### Test file structure

```
src/__tests__/
  schemas/
    frontmatter.test.ts
    journal.test.ts
    profile.test.ts
  services/
    contextAssembler.test.ts
    entryProcessor.test.ts
    fs.test.ts
  utils/
    tokenEstimator.test.ts
```

No `hooks/`, `stores/`, or `components/` directories.

## Desired Behaviour

- `vitest.config.ts` configured with `environment: 'jsdom'` and a setup file.
- `@testing-library/react`, `@testing-library/dom`, `@testing-library/jest-dom`, and `jsdom` installed as dev dependencies.
- A setup file that imports `@testing-library/jest-dom/vitest` for extended matchers.
- Test directory structure ready for hooks, stores, and components.
- Existing tests still pass without modification.

## Implementation Steps

### 1. Install dev dependencies

```bash
npm install -D @testing-library/react @testing-library/dom @testing-library/jest-dom jsdom
```

### 2. Update `vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['src/__tests__/setup.ts'],
    // ...existing config
  },
})
```

### 3. Create `src/__tests__/setup.ts`

```typescript
import '@testing-library/jest-dom/vitest'
```

This registers matchers like `toBeInTheDocument()`, `toHaveTextContent()`, etc. for all test files.

### 4. Create directory structure

```bash
mkdir -p src/__tests__/hooks
mkdir -p src/__tests__/stores
mkdir -p src/__tests__/components/ui
```

### 5. Add a store test harness pattern

Create `src/__tests__/stores/_helpers.ts` with a reusable pattern:

```typescript
import { create } from 'zustand'

/**
 * Creates a fresh, isolated store instance for testing.
 * Zustand stores created with `create()` are singletons by default,
 * which causes test pollution. This helper re-creates the store for
 * each test, ensuring a clean slate.
 *
 * Usage:
 *   const store = createTestStore(journalStoreFactory)
 *   store.getState().addEntry(entry)
 *   expect(store.getState().entries).toHaveLength(1)
 */
export function createTestStore<T>(
  factory: Parameters<typeof create<T>>[0],
) {
  return create<T>()(factory as any)
}
```

### 6. Verify existing tests still pass

```bash
npm test
```

The switch from `node` to `jsdom` environment should be backward-compatible — jsdom provides a superset of Node's globals. If any test relies on Node-specific behavior (unlikely given the current test suite), add `// @vitest-environment node` to that file.

## Files to Modify

- **Modify**: `package.json` — add 4 dev dependencies.
- **Modify**: `vitest.config.ts` — add `environment: 'jsdom'` and `setupFiles`.
- **New**: `src/__tests__/setup.ts`
- **New**: `src/__tests__/stores/_helpers.ts`
- **New directories**: `src/__tests__/hooks/`, `src/__tests__/stores/`, `src/__tests__/components/ui/`

## Dependencies

None. This is the prerequisite for tasks 01, 02, 05, 06, 07, 09, 11.

## Testing Notes

### Verification

1. `npm test` — all 7 existing test files pass with `jsdom` environment.
2. Create a throwaway test to verify the infra works:

```typescript
// src/__tests__/hooks/_sanity.test.ts
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useState } from 'react'

describe('test infra sanity check', () => {
  it('renderHook works with jsdom', () => {
    /**
     * This test exists only to verify that the jsdom + @testing-library/react
     * setup is working correctly. If renderHook fails here, no hook test in
     * the refactor suite will work. Delete this test once at least one real
     * hook test exists.
     * Input: renderHook(useState(0)), then act(() => setter(1))
     * Expected output: result.current[0] === 1
     */
    const { result } = renderHook(() => useState(0))
    act(() => result.current[1](1))
    expect(result.current[0]).toBe(1)
  })
})
```

3. Delete the sanity test once a real hook test lands (task 02 or 05).
