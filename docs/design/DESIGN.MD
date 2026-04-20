# NOPY

*Design Philosophy & Visual Language*

Design Document v2.3 — April 2026

*Reconciled with prototype design tokens, including the actual dark-mode palette. Key changes from v2.0: mixed corner system (sharp containers, rounded interactive), mixed-family typography (serif content + sans UI, with P22 Mackinac reserved for the AI companion), three-token motion system, formalized ink-tinted neutrals with the no-black rule holding in both modes, and a dark-mode metaphor corrected from "Lamplight" (warm sepia) to "Midnight" (cool ground with warm accents).*

---

## 1. The Core Idea

Nopy is a digital **notebook**, not a digital book.

A book is finished, authored, published — something you receive.
A notebook is in progress, yours, held — something you inhabit.

This distinction is the foundation of every design decision that follows. Nopy is a space the user *lives in*, not content they *consume*. The interface should feel like a well-loved Moleskine: personal, tactile, carrying the warmth of use without the clutter of ornament.

The name comes from *canopy* — the sheltering crown of a tree — and carries a specific emotional target: reading in a private, warmly-lit place on a quiet afternoon. That feeling is atmospheric, never literal. There are no leaves in the interface. The canopy is in the temperature, the materials, and the restraint.

---

## 2. The Ten Principles

These are the rules of the house. They are meant to be memorized, quoted, and used to settle arguments.

### I. Disciplined Warmth

Warmth lives in the materials — paper, ink, serif type, golden color temperature. Structure stays rigorous. The grid does not yield. Cozy is earned by restraint, never by quirk.

### II. Material Over Decoration

If an element is warm, it is warm because of what it is made of, not because we drew something warm onto it. Paper grain, not leaf clip-art. Serif type, not hand-lettered flourishes. The material does the work.

### III. The Notebook, Not the Book

This is a place to write, not a place to read someone else. Finished-feeling "published" polish is the wrong register. The interface should carry the quiet invitation of a blank page.

### IV. Presence Over Productivity

Nopy is a place the user goes *to slow down*. Every decision is measured against: *does this invite the user to stay, or push them to finish?* Streaks, badges, completion meters, and urgency cues are the wrong language.

### V. Architecture Is Cut, Interaction Is Held

Containers (cards, panels, page surfaces) have sharp corners — they are *architectural*, like the trimmed edge of a page or the cut of a book block. Interactive elements (buttons, inputs, tags) have gentle rounding — they are *things the user touches*, and a hand-held object has no points. This mixed geometry is the single most distinctive formal choice in the system. It rejects the uniform 16px-rounded language of every other wellness app.

### VI. Two Registers, One Material

The app is spare, textual, and disciplined. The marketing site is warm, expressive, and at higher volume. They share the same palette, typography, and materials — only the *amount* changes. Marketing is the app, turned up.

### VII. Fast for Infrastructure, Slow for Content

Navigation should vanish. Content should arrive. Menu transitions are instant; opening an entry, starting a session, or surfacing a reflection should feel like opening a book to a marked page — unhurried, deliberate, honored.

### VIII. Atmospheric, Not Literal

The forest is a feeling, not a graphic. No leaves, no branches, no woodland mascots. The "canopy" is evoked through green-flecked color, warm paper, dappled gradients, and the sense of being gently enclosed.

### IX. The Writer Is the Content

The user's words are the most important thing on any screen they appear on. UI chrome — buttons, sidebars, metadata — should visibly defer. If a user's journal entry is on screen, nothing should compete with it.

### X. Nothing Twee

No whimsical copy that calls attention to itself. No rustic flourishes. No watercolor mushrooms. No typewriter sound effects. No "your cozy little nook" microcopy. The warmth must be trustworthy, or it isn't warmth — it's marketing.

---

## 3. The Two Registers

Nopy lives on two surfaces, and they behave differently.

**The App** is where the emotional work happens. It is spare, textual, confident, and quiet. The user is alone with their thoughts. Interface elements are present but recessive. The dominant visual material is the user's own writing, set on warm paper.

**The Marketing Site** is where the invitation happens. It uses the same palette and typography as the app but at higher expressive range: larger type, more generous whitespace, abstract color washes as hero backgrounds, and product imagery of the app itself. It can afford to be more beautiful because the user is not yet doing vulnerable work inside it.

Both registers share a material system. The marketing site is not a different brand; it is the same brand at a different volume.

---

## 4. Color

The palette is drawn from the canopy itself — forest greens, warm creams, and muted browns. It should feel like dappled sunlight through leaves, aged paper, worn leather, and the golden warmth of a summer afternoon.

### 4.1 Primary Palette (Light Mode)

| Name | Token | Hex | Role |
|---|---|---|---|
| Parchment | `--parchment` | `#FAF7F2` | Primary background — the page itself |
| Warm Cream | `--warm-cream` | `#F5F0E8` | Secondary background — cards, panels, sidebar |
| Ink | `--ink` | `#2C3E2C` | Primary text — headings, key content |
| Manuscript | `--manuscript` | `#3A3A3A` | Body text — journal entries, descriptions |
| Forest | `--forest` | `#5B7F5E` | Primary accent — CTAs, active states, links |
| Sage | `--sage` | `#6B8C6B` | Secondary accent — icons, metadata, borders |
| Amber | `--amber` | `#D4A574` | Warm accent — highlights, notifications, emphasis |
| Bark | `--bark` | `#8B7355` | Tertiary — subtle borders, dividers |
| Stone | `--stone` | `#D4C9B8` | Neutral — borders, rules, inactive elements |

### 4.1.1 The No-Black Rule

Nopy contains no pure black, anywhere, ever. Every "dark" value in the system carries a trace of Ink green (`#2C3E2C`). This applies to:

- **Text** — always Ink or Manuscript, never `#000`
- **Shadows** — tinted with ink-green, not neutral gray (see 6.3)
- **Borders and dividers** — drawn from Stone, Bark, or Sage
- **Disabled states** — low-opacity Ink, not gray

This is a quiet but load-bearing rule. Neutral grays drift a product toward "software"; ink-tinted neutrals keep it anchored in the material world of the notebook.

### 4.2 Dark Mode — *"Midnight"*

Dark mode is not an inverted palette, and it is not a warmer one. It is a **different time of day**.

Where light mode draws its warmth from the paper itself — ambient, surrounding — dark mode draws its warmth from *specific points of light* against a cool, quiet ground. The metaphor is the room after dark: the lamp hasn't been turned on yet, the walls have gone blue, but the page still holds the amber of the last hours of daylight. The letters stay warm. The room goes cool.

This is deliberately not the "bourbon-lounge" dark mode common to wellness apps — all sepia, all brown, all heavy. Midnight has *space* in it. The cool ground breathes; the warm accents do the emotional work.

| Name | Token | Hex | Role |
|---|---|---|---|
| Parchment | `--parchment` | `#0F1420` | Primary background — the room after dark |
| Warm Cream | `--warm-cream` | `#171D2E` | Secondary background — cards, panels, sidebar |
| Ink | `--ink` | `#E8E4DF` | Primary text — warm white, not cool |
| Manuscript | `--manuscript` | `#C8C4BF` | Body text |
| Forest | `--forest` | `#6B9F6E` | Primary accent — brightened for legibility |
| Sage | `--sage` | `#7BA07B` | Secondary accent |
| Amber | `--amber` | `#E0B584` | Warm accent — now a primary source of warmth |
| Bark | `--bark` | `#A08A6C` | Tertiary — reads as golden highlight in dark mode |
| Stone | `--stone` | `#2A3040` | Neutral — cool blue-gray, anchors the palette |
| Gentle Green | `--gentle-green` | `#8BC18B` | Positive states |
| Soft Coral | `--soft-coral` | `#D49580` | Gentle alerts |
| Dusk Blue | `--dusk-blue` | `#92A8BC` | Informational |
| Sunlight | `--sunlight` | `#E0C48A` | Celebrations, milestones |

### 4.2.1 How Warmth Works Differently in Each Mode

This is the key insight that separates Nopy's dark mode from a naive inversion:

- In **light mode**, warmth is *ambient*. The whole environment is warm (Parchment, Warm Cream), and accents are restrained so they don't over-saturate an already-warm field.
- In **dark mode**, warmth is *sourced*. The environment is cool (blue-slate backgrounds), and the warm elements (Amber, Bark, Forest) glow against it.

A practical consequence: elements like Amber notifications or Forest buttons feel *brighter and more emphatic* in dark mode, because they are now the only warmth on screen. This is correct. Dark mode should feel slightly more event-driven, slightly more cinematic — like attention is being directed to specific moments of warmth against a resting ground.

### 4.2.2 Dark-Mode Shadows — Tinted, Not Black

The no-black rule holds in dark mode, too. Shadows are tinted toward the Parchment ground (`#0F1420`) rather than pure black:

| Token | Dark Mode Value |
|---|---|
| `--shadow-warm` | `rgba(5, 8, 16, 0.2)` |
| `--shadow-warm-hover` | `rgba(5, 8, 16, 0.3)` |
| `--shadow-warm-deep` | `rgba(5, 8, 16, 0.4)` |

The difference from pure black is small at 20–40% opacity, but it matters: it keeps the material logic consistent across both modes. In light mode, shadows are ink soaked into paper. In dark mode, shadows are a deeper pool of the same night. Nothing in Nopy is ever truly black — not the text, not the borders, not the shadows. The ground colors shift with the time of day; the rule does not.

### 4.3 Semantic Colors

| Name | Hex | Role |
|---|---|---|
| Gentle Green | `#7BAF7B` | Positive states, growth indicators |
| Soft Coral | `#C4836A` | Gentle alerts, low-mood indicators (warm, never alarming) |
| Dusk Blue | `#7B8FA2` | Informational, reflection prompts |
| Sunlight | `#D4B87A` | Celebrations, milestones |

### 4.4 Color Rules

- Never pure white (`#FFFFFF`) as a background — always Parchment or Warm Cream.
- Never pure black (`#000000`) for text — always Ink or Manuscript.
- Forest green is reserved for interactive elements and key headings. It is the app's signature; overuse dilutes it.
- Amber is an *event color*. It marks moments of significance. If Amber appears on every screen, it signifies nothing.
- Semantic colors (Coral, Dusk Blue, Sunlight) should remain rare. When something turns coral, the user should notice.
- All combinations must pass WCAG AA contrast ratios.

---

## 5. Typography

Typography is doing most of the aesthetic work in Nopy. It deserves more attention than any other subsystem.

Nopy uses a **mixed-family system**: serifs for content (what the user reads and writes), a sans-serif for UI chrome (what the user operates). This is not a compromise — it is a deliberate separation of *voice* from *infrastructure*. The serifs hold the emotional register; the sans keeps the interface legible and quiet at small sizes without pretending to be a book when it isn't one.

### 5.1 The Typographic Stack

| Role | Face | Token | Use |
|---|---|---|---|
| Display | **P22 Mackinac Pro** | `--font-display` | Marketing hero, rare app headlines |
| Heading | P22 Mackinac Pro | `--font-heading` | Section titles, page headers |
| Page title | **Freight Text Pro** | `--font-title` | Entry titles, date headers |
| Body | **Source Serif 4** | `--font-body` | Journal entries, long-form reading |
| UI | **Source Sans 3** | `--font-ui` | Buttons, labels, nav, metadata |
| Companion | P22 Mackinac Pro | `--font-agent` | The AI companion's voice (see 5.2) |
| Mono | **JetBrains Mono** | `--font-mono` | Markdown source view, technical metadata |

Fallbacks follow a graceful degradation path: branded face → nearest web-safe equivalent (Lora, Charter, Nunito Sans) → system serif/sans. Specified in that order in every token.

### 5.2 The Companion Has Its Own Type

The AI companion's messages are set in **P22 Mackinac Pro**, the same face as display headlines — not the body serif the user writes in. This is a subtle but important distinction: the companion is *not the user*, and its voice should not camouflage itself as the user's own writing. A slightly warmer, more editorial face gives the companion a presence — like a letter from a thoughtful correspondent set in a different hand from your own.

This is the material equivalent of a therapist's voice: familiar, but distinctly *other*. It also solves the problem raised in the prototype audit, where the chat interface felt like AI messages floated on the page without being "held." Giving the companion its own type is the hold.

### 5.3 Typographic Scale

One scale, rendered across the stack above:

- **Display** — marketing hero, rare app moments (80–120px)
- **H1** — page titles, entry dates (32–40px)
- **H2** — section headings (24–28px)
- **Body** — journal content, companion messages (17–19px, line-height 1.6–1.8)
- **UI** — buttons, labels (14–15px)
- **Metadata** — timestamps, word counts (12–13px, often in Sage)

Body text leans **larger than SaaS convention**. A journal is for reading; body text should feel like an open book, not a Slack message.

### 5.4 Reading Width

Content areas are capped at `--content-max: 720px`. This produces a reading line of roughly 60–75 characters in Source Serif 4 at 18px — the zone where long-form prose is most comfortable to read. This cap is honored on all content surfaces (journal entries, companion chat, profile prose) regardless of viewport width. The user's writing never stretches to fill a 1600px monitor.

### 5.5 Typographic Rules

- Never justify body text. Left-aligned, ragged right, like a book.
- Use true small caps and old-style numerals where the face supports them.
- Em dashes, not hyphens, for parenthetical breaks — they feel considered.
- Curly quotes always. Straight quotes are forbidden.
- Sans-serif UI stays sans-serif. Do not "upgrade" a button label to serif because it feels more literary; the mixed system only works if the split is clean.

---

## 6. Shape, Structure, and Space

### 6.1 Corners — The Mixed System

Nopy uses two corner radii, applied by *role*, not by aesthetic preference.

**Sharp (`0px`) — architectural elements:**
- Page surfaces and backgrounds
- Sidebar, navigation rails
- Cards, panels, content containers
- Modals, sheets, drawers
- Section dividers and content wells

These are the *page*. They have the trimmed edge of a book block.

**Gently rounded — interactive elements:**
- `--radius-sm: 6px` — small interactive elements (tags, chips, small buttons, input borders)
- `--radius-md: 10px` — standard interactive elements (primary buttons, form fields, toggles)
- `--radius-lg: 14px` — prominent interactive elements (large CTAs, search fields, feature buttons)

These are *things the user touches*. A held object has no sharp points. The gentle rounding signals interactiveness without descending into the generic 16px+ rounding of the wellness-app category.

**Exception:** Avatars, mood dots, and other circular markers remain fully circular.

The test: *Is this element a surface that holds content, or an object the user acts upon?* Surfaces are cut. Objects are held.

### 6.2 Borders and Rules

Hairline rules only. One pixel, in Stone or Bark. Rules are used to divide sections, not to enclose them. Heavy borders, double rules, and boxed containers are editorial anti-patterns.

### 6.3 Elevation — Ink-Tinted Shadows

Nopy does not use pure-black shadows. All shadows are tinted with Ink green, producing a subtly warm penumbra that feels like ink soaked into paper rather than a software drop-shadow.

| Token | Value | Use |
|---|---|---|
| `--shadow-warm` | `0 1px 2px rgba(44, 62, 44, 0.06)` | Resting state — cards on page |
| `--shadow-warm-hover` | `0 2px 6px rgba(44, 62, 44, 0.12)` | Hover and focus states |
| `--shadow-warm-deep` | `0 6px 16px rgba(44, 62, 44, 0.18)` | Modals, popovers, elevated surfaces |

Shadows remain restrained. Most elements should feel *printed on* the page, not *floating above* it. `--shadow-warm-deep` is reserved for true overlays — modals and popovers — never for decorative lift on cards.

### 6.4 Whitespace

Generous. Breathe. The page is not a resource to conserve. A journal entry screen might have half its pixels empty, and this is correct. Whitespace is the primary signal that the user has space to think.

### 6.5 Paper Texture

A subtle grain applied to Parchment and Warm Cream backgrounds. The texture must:

- Be *nearly imperceptible* at normal viewing distance — felt, not seen.
- Resemble the tooth of real paper stock, not a Photoshop filter.
- Tile seamlessly without visible repetition.
- Be provided at 1x, 2x, and 3x for retina displays.
- Be color-appropriate for both light mode (warm cream grain) and dark mode (subtle leather grain).

If the texture becomes noticeable, it has failed. It should only be missed when it is removed.

### 6.6 Layout Tokens

| Token | Value | Role |
|---|---|---|
| `--sidebar-width` | `221px` | Primary nav rail width |
| `--content-max` | `720px` | Max width for content (journal, chat, profile prose) |

The 720px content cap is load-bearing — it enforces a reading-appropriate line length across every content surface. See §5.4.

---

## 7. Motion

The governing principle: **fast for infrastructure, slow for content.**

Motion in Nopy is encoded into three tokens, each with a defined role. Developers and designers should use the token, not a one-off value.

| Token | Duration | Easing | Use |
|---|---|---|---|
| `--transition-fast` | `150ms` | `ease-out` | Hover states, button presses, menu opens, tab switches, toasts, modal close |
| `--transition-gentle` | `280ms` | `ease-out` | Default for most interactions — the "normal" pace of the app |
| `--transition-slow` | `450ms` | `cubic-bezier(0.4, 0, 0.2, 1)` | Opening a journal entry, entering a session, surfacing the companion, transitions into content |

### 7.1 The Rule

- **Infrastructure is fast.** Navigation, menus, toggles, hovers — the plumbing of the app — uses `--transition-fast`. The user's time is respected. Administrative motion disappears.
- **Content is slow.** Opening something the user will read or write in — a journal entry, a session, a reflection — uses `--transition-slow`. Content arrives; it is handed to the user; the transition is the handoff.
- **Everything else** uses `--transition-gentle`. When in doubt, gentle.

### 7.2 What Is Absent

No parallax. No loading spinners where a skeleton will do. No decorative motion. No animated illustrations. No "breathing" buttons. No celebration confetti.

### 7.3 The One Ambient Motion

A single permitted ambient motion: a soft, slow blink on the text cursor when the user is invited to write. This is the app breathing — not decorative, but alive. It suggests the page is listening.

---

## 8. Iconography

Line icons only. Thin stroke (1.5px), rounded caps, drawn on a consistent grid. **Lucide** or **Phosphor Regular** are appropriate starting libraries.

Icons appear:
- In navigation (small, Sage-colored)
- Inside buttons (paired with a label, never alone unless the function is unambiguous)
- As metadata prefixes (word count, read time)

Icons do not appear:
- As decoration
- In empty states (use typography instead)
- In the journal writing surface itself

The brand should ultimately develop a small set of custom icons for the product's signature actions (new entry, start session, reflection). These may carry a slight engraved/woodcut quality, echoing the wordmark's secondary mark.

---

## 9. Imagery

### 9.1 In the App

None. The app contains no photography and no illustration. The user's writing, well-set on warm paper, is the imagery.

### 9.2 On the Marketing Site

**Abstract color washes only.** Large, soft gradients sampled from the app's palette — parchment into sage, amber into bark, dusk into cream. These function as atmospheres rather than pictures.

No stock photography. No hands holding journals. No candles, tea cups, cozy cabins, fireplaces, or forests. The market is saturated with this imagery and Nopy must never be confused with it.

**Product shots are welcome.** Screenshots of the app itself, set against warm backgrounds, are the strongest possible marketing imagery: the restraint of the app becomes the promise of the brand.

### 9.3 The Wordmark Mark

A small engraved/woodcut-style glyph accompanying the "nopy" wordmark functions as a secondary brand signature — the modern equivalent of a book publisher's colophon. It may appear:

- Beside the wordmark in the app header
- As a favicon
- Enlarged as a decorative element on marketing section breaks
- As a closing mark at the end of long-form content (the colophon tradition)

The glyph should feel *printed*, not *drawn* — rough-edged, single-color, carrying the texture of ink on paper.

---

## 10. The Wordmark

"nopy" set in a distinctive serif, always lowercase. The lowercase is important: it carries the cozy, unassuming quality. Uppercase "NOPY" reads as a tech company; lowercase "nopy" reads as a notebook label.

The wordmark is the brand's primary asset. It should be treated with the seriousness of a book publisher's logo: specific letterspacing, specific optical adjustments, deployed at consistent proportions. A bespoke or lightly customized serif is warranted precisely because there is no icon to hide behind.

The wordmark pairs with the small woodcut mark (section 9.3) as a secondary lockup. Together they form the brand's signature.

---

## 11. Writing and Voice (placeholder)

The app's voice is *companion-like* — addressing the user as a gentle, literate presence rather than a tool. A dedicated voice and copywriting document is forthcoming. Until then, two guardrails:

- The companion speaks at **moments of significance** (prompts, reflections, AI messages). Administrative UI (settings, navigation, buttons) remains plainly labeled.
- There is a razor-thin line between *gentle companion* and *twee AI concierge*. When in doubt, write less and more plainly.

---

## 12. Anti-Patterns (Things Nopy Is Not)

A list to be held close. If the design starts to resemble anything in this list, something has gone wrong.

- The Headspace/Calm school — too saccharine, uniformly rounded, too illustrated
- The Notion/Linear school — too cold, too grid-forward, too "productivity"
- The cozy-aesthetic Pinterest board — mushrooms, cottagecore, rustic calligraphy
- The meditation-app gradient — generic purple-to-pink "serenity"
- The clinical journal app — forms, scores, charts, "CBT worksheet" energy
- The AI chatbot aesthetic — bubbles, avatars, conversational UI conventions
- The "wellness startup" landing page — stock photos of meditating people, gradient buttons, soft-sell copy

Nopy is a *notebook with a quiet, well-read friend inside*. Everything flows from that.

---

## 13. Applying This Beyond the Product

This design language is intended to extend to:

- **App UI** (primary surface, most restrained)
- **Marketing site** (same language, higher volume)
- **Documentation** (treated as editorial — long-form serif, generous margins)
- **Email and notifications** (plain, serif, minimal chrome)
- **Social and PR assets** (wordmark and mark, abstract washes, product screenshots)
- **Any future extensions** (onboarding guides, physical merchandise, conference materials)

The test for any new surface is: *does it feel like it came from the same notebook?* If a designer would plausibly sketch the new asset in the margins of the product itself, the answer is yes.

---

*End of document. Version 2.0. Voice and copy guide, component-level specifications, and full dark-mode palette audit to follow in subsequent documents.*