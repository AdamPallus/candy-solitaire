# Mobile Experience Assessment (Candy Solitaire Prototype)

Date: 2026-02-05  
Project: `/Users/pallusa/clawd/_scratch/candy-solitaire-proto` (Vite + React + TypeScript)

## Executive summary

The current prototype is playable on mobile, but it behaves like a “desktop-first layout that scales down.” The biggest mobile risks are (1) small tap targets due to CSS `transform: scale(...)`, (2) too much simultaneous UI (status + piles + full side panels) competing with the playfield, and (3) missing mobile-specific interaction affordances (tap feedback, thumb reach, safe-area padding, and scroll/pan strategy for the board).

This report focuses on quick, high-impact improvements that make the game feel “native mobile” without changing core mechanics.

## What I reviewed

- Gameplay UI + controls in `src/App.tsx`
- Responsive behavior + sizing in `src/index.css`
- Seed / deal determinism in `src/game.ts` and `src/App.tsx`

## Key mobile issues and recommendations (prioritized)

### 1) Tap targets are likely too small on phones

**Finding**
- The board is shrunk via transforms: `@media (max-width: 980px) { .board { transform: scale(0.9) } }` and `@media (max-width: 640px) { .board { transform: scale(0.8) } }` in `src/index.css`.
- Scaling the entire board reduces the effective tap area of each card as well.

**Recommendation**
- Prefer responsive sizing by adjusting CSS variables instead of transform scaling:
  - Compute `--card-w`, `--card-h`, `--slot-x`, `--slot-y` using `clamp(...)` based on viewport width/height.
  - Keep a minimum tap target goal (roughly 44×44 CSS px) for frequent actions (cards, powerups, draw/hold).
- If the board can’t fit comfortably, choose a deliberate strategy:
  - Horizontal pan (overflow-x) on the board container, or
  - Pinch-to-zoom / two-finger pan (more work), or
  - A “zoomed focus” mode that magnifies the tableau during play.

### 2) Too much UI competes with the playfield on small screens

**Finding**
- On mobile widths, `.main` becomes a single column, but the “side panel” sections still render and can push the play area down.
- The top bar includes title/subhead + seed controls, which is a lot of vertical space for phones.

**Recommendation**
- Collapse secondary info (How to Play / Difficulty / Deal Details) behind an info button or accordion.
- Keep core gameplay controls close to the playfield:
  - A compact “action strip” (Undo, Wrap toggle, Powerups, Hold) positioned under/near the tableau.
- Consider a bottom sheet for “Powerups” and “How to Play” rather than persistent panels.

### 3) Add touch-first interaction polish

**Finding**
- There are hover effects (e.g. `.card.playable:hover`) that don’t translate to touch.
- No explicit mobile tap behavior hints (`touch-action`, tap highlight control).

**Recommendation**
- Add touch ergonomics CSS:
  - `touch-action: manipulation;` on interactive elements (cards/buttons) to reduce gesture delay and accidental zoom.
  - `-webkit-tap-highlight-color: transparent;` for cleaner taps (optional).
  - Use `:active` styles for immediate tactile feedback (pressed state), not only `:hover`.
- Add haptics/audio hooks (even simple) for: valid play, invalid tap, combo threshold, powerup earned, win/loss.

### 4) Thumb reach: move critical buttons out of the top area

**Finding**
- “Deal New Game”, seed field, and other controls live in the header (top of screen).

**Recommendation**
- For mobile, prioritize one-handed play:
  - Move Draw/Hold/Undo/Powerups into a reachable bottom cluster.
  - Leave the seed and meta settings in a secondary menu.

### 5) Safe-area and notch handling

**Finding**
- The layout uses fixed padding in `.app` and doesn’t account for safe-area insets.

**Recommendation**
- Add safe-area padding where it matters (especially if you add bottom controls):
  - `padding-bottom: max(20px, env(safe-area-inset-bottom));` on the main container or bottom bar.
  - Similar for top inset if you ever add sticky headers.

### 6) Readability and contrast in bright environments

**Finding**
- The UI is stylish and candy-like, but some pastel-on-pastel areas may wash out in sunlight.

**Recommendation**
- Run a quick contrast pass for critical text (score/combo, buttons, card faces).
- Consider a “high contrast” toggle (or automatically adapt when `prefers-contrast: more` is available).

### 7) Gesture design choices (future)

**Recommendation ideas**
- Tap-to-play as primary; drag as optional (Tri-Peaks works great with tap).
- Optional “auto-move when unambiguous” to reduce precision.
- Snap-to-target if you introduce dragging.

## Seed / replay UX (status)

Previously the prototype defaulted to a fixed seed, so new players all saw the same deal unless they changed the seed manually.

I updated the app so:
- The initial deal uses a random seed.
- “Deal New Game” randomizes by default.
- Typing a seed automatically “locks” it so you can reliably replay/share a deal.
- You can also toggle “Lock seed” explicitly.

See `src/App.tsx`.

## Suggested next steps (if you want me to implement)

1) Replace board transform scaling with responsive CSS variables (biggest mobile win).
2) Convert side panels into collapsible sections or a bottom sheet on small screens.
3) Add touch-first CSS + pressed states + optional haptics.

