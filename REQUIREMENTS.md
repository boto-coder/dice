# Dice Roller Web App — Requirements

_Status: v1 · Last updated: 2026-11-03_

## 1. Overview

**Purpose:** A quick, reliable digital dice roller for use at the table: for tabletop RPG sessions, and as a stand-in when a physical die from a board game has gone missing.

**Target users:**

- Tabletop RPG players and GMs (e.g. D&D-style games)
- Board gamers playing complex games who need to replace a lost die

## 2. Goals & Non-Goals

### Goals

- Roll standard RPG dice with a single click
- Recreate any lost board-game die, including symbol dice, and reuse it later
- Satisfying 3D roll animations driven by real physics
- Works well on both desktop and mobile browsers, including offline

### Non-Goals (out of scope for v1)

- Saved group presets (e.g. "Attack: d20 + d8"), deferred to a later version
- Dice notation input (e.g. `2d6+3`)
- Roll modifiers
- Arbitrary dN dice beyond the standard RPG set
- Custom dice with non-standard face counts (e.g. 5 faces)
- Sound effects
- Persisted roll history
- Backend / user accounts / multiplayer sync
- Native mobile apps

## 3. Functional Requirements

### 3.1 Dice Types

- **Standard RPG set:** d4, d6, d8, d10, d12, d20, d100.
- **d100:** A **single ball-style die** (Zocchihedron-like): a near-spherical body with 100 faces. It rolls under physics; its result is read from the results panel (decided after milestone 4: no extra label on the die).
  - A 100-face ball cannot have identical faces, and milestone 8 tests showed some faces land more often (as with physical ball dice). So the numbers are shuffled onto the faces before every throw: physics decides which face lands on top, and every number is exactly equally likely.
- **Custom-face dice** (to replace lost board-game dice):
  - Custom dice use **standard shapes only**: they must have 4, 6, 8, 10, 12, or 20 faces, and the matching polyhedron is used.
  - The user creates a die by listing its faces. A face can be a number, text, or emoji/symbol (e.g. `⚔️, ⚔️, 🛡️, 🛡️, 💀, blank`).
  - Duplicate faces are allowed, which gives weighted outcomes.
  - Each custom die has a name (e.g. "Combat die").
  - Custom dice are saved and reusable across sessions.
  - The user can create, edit, and delete custom dice.

### 3.2 Rolling

- Rolling is done by **clicking/tapping buttons**.
- **No modifiers** (+/-) in v1.
- **Dice groups:** The user can roll several dice together as one group.
  - The group can hold several of the same die (e.g. 2 × d6).
  - The group can mix dice types (e.g. 1 × d6 + 1 × d10).
  - Custom dice can be mixed with standard dice (e.g. 2 × "Combat die" + 1 × d6).
  - **Building a group:** Tap a dice button to add that die to the **tray** (tap d6 twice to get 2 × d6). Tap a die in the tray to remove it. Press **Roll** to roll the whole tray.
  - All dice in the group are thrown and simulated at the same time.
  - **Tray limit:** At most **20 dice** per group (for performance on mobile).
- **Roll again:** After a roll, a **Roll again** button re-throws the same group.

### 3.3 Results Display

- Rolls are **shown graphically**: 3D dice tumble and settle, not only as numbers.
- After the dice settle, each die's result is shown clearly, both on the die and in a results panel.
- **Sum:** Show the total of all number dice in the group.
- **Symbol dice:** Show only the face results, with no sum or tally.
- **Crits:** A natural 20 or a natural 1 on a d20 gets a special visual highlight (e.g. a glow on the die and in the results panel).

### 3.4 Roll History

- Show the **last 20 rolls** of the session, newest first. Each entry shows the group, the individual results, and the sum.
- A **Clear** button empties the history.
- History is **not persisted**; it clears on page reload.

### 3.5 Possible Future Features (not in v1)

- Saved group presets
- Advantage/disadvantage, keep highest/lowest, exploding dice
- Sound effects
- Persisted history

## 4. Non-Functional Requirements

- **Platforms / devices:** Browser-based web app with a responsive layout for desktop and mobile. Supports current evergreen browsers (Chrome, Firefox, Safari, Edge), including mobile Safari and Chrome.
- **Static app:** Purely static files with no server-side code.
- **Offline / installable:** Built as a **PWA** (web manifest + service worker). After the first load it works fully offline and can be added to a phone's home screen.
- **Performance:** Rolling 20 dice stays smooth (target 60 fps on a mid-range phone). Dice should settle within about 3 seconds; if physics hasn't settled after a timeout, the roll is resolved anyway.
- **Accessibility:**
  - Results are announced to screen readers through an ARIA live region.
  - All controls are reachable and usable by keyboard, with visible focus.
  - Controls have accessible labels (e.g. "Add d20 to tray").
  - Sufficient color contrast.
  - Respects `prefers-reduced-motion` with a shortened or simplified roll animation.
- **Randomness:** Results come from the physics simulation. Initial throw parameters (position, velocity, spin) are randomized using `crypto.getRandomValues`. Fairness is **verified statistically** (see 6.1): a chi-square test per die passes at p > 0.01.

## 5. UI / UX

- **Look & feel:** Clean and minimal for now; we'll revisit the visual style later.
- **Layout:**
  - A 3D dice area (the "table") takes up most of the screen.
  - A dice button bar: d4 … d100, plus saved custom dice.
  - The tray, the Roll / Roll again buttons, and the results panel with the sum.
  - History and the custom-dice manager open as panels or drawers.
  - On mobile, controls stack below or over the table and remain thumb-reachable.
- **Animations:** 3D dice tumble across the table and settle on the result face.
- **Sound:** None in v1.

## 6. Technical Approach

- **Language / build:** TypeScript + **Vite**.
- **Rendering:** **Three.js**.
- **Physics:** **`cannon-es`**. Each die has a physics body matching its shape. The result is the face whose normal points most nearly straight up after settling. For the d4, the result is read from the top vertex, as on a real d4.
- **Dice:** Custom-built geometry, face mapping, and face textures. Face textures are generated at runtime on a canvas, so custom text and emoji work.
- **UI layer:** Plain DOM + TypeScript (no UI framework).
- **Architecture:** Keep pure logic (dice definitions, face reading, tray, results, history, storage) separate from rendering. That way the logic and physics can be tested in Node without a browser.
- **Persistence:** `localStorage` for custom dice only, stored as versioned JSON.
- **Backend:** None.
- **Hosting:** GitHub Pages at https://boto-coder.github.io/dice/ (decided in milestone 9). A GitHub Actions workflow runs the full test suite on every push to `master` and publishes only the built app if it passes. Source: public GitHub repo `boto-coder/dice`; Entire session checkpoints are kept in a separate private Entire repo and never pushed to GitHub.

### 6.1 Testing (full suite)

- **Unit tests (Vitest):**
  - dice definitions
  - face-up detection for every die type, including d4 and d100
  - custom-dice validation (allowed face counts, names, empty faces)
  - sum and crit logic
  - tray rules (adding, removing, the 20-dice limit)
  - history (the 20-entry cap and clearing)
  - storage (save/load/versioning and corrupt-data handling)
- **DOM/component tests (Vitest + jsdom + Testing Library):**
  - button → tray → roll flow
  - results panel
  - history panel
  - custom-dice editor
  - ARIA live announcements
- **End-to-end tests (Playwright):**
  - full roll flows on desktop and mobile viewports
  - creating, using, editing, and deleting a custom die
  - custom dice persisting across a reload
  - offline load through the service worker
- **Accessibility tests:** Automated axe checks in Playwright, plus keyboard-only navigation tests.
- **Physics/fairness tests:** A headless `cannon-es` harness running in Node rolls each die type thousands of times. A chi-square test checks for a uniform distribution, for the standard dice and for a sample custom die. This also includes a settle-time / timeout check.
- **CI-ready:** One command (`npm test`) runs everything. Coverage is reported, with a target of ≥ 90% on the logic modules.

## 7. Open Questions

- **Visual style:** Revisit look & feel after the first working version (table surface, dice materials, colors).
- **Theme:** Light, dark, or follow the system setting?

## 8. Milestones

1. **Project setup:** Vite + TypeScript, Vitest, Playwright, linting/formatting, `npm test` script.
2. **Core logic (no graphics):** Dice definitions, tray, results/sum/crit rules, history, and custom-dice model + validation + storage, all with unit tests.
3. **3D foundation:** Three.js scene with a table and lighting, a `cannon-es` world, one d6 that throws, settles, and reports its face.
4. **All dice shapes:** d4, d8, d10, d12, d20, and the ball-style d100, with geometry, physics bodies, numbered face textures, and face-reading tests.
5. **Groups and UI:** Dice buttons, tray (with the 20-dice limit), Roll / Roll again, results panel with sum, crit highlight, history panel, responsive layout.
   - The table must grow with the group size (camera zooms out). Milestone 3 simulations showed 20 dice need roughly a 16×12 table to settle in under 4 s without piling up.
6. **Custom dice:** Editor (create/edit/delete), runtime face textures for text and emoji, mixing custom dice into groups, persistence.
7. **Accessibility and PWA:** ARIA live results, keyboard support, reduced motion, manifest + service worker, offline E2E test.
8. **Fairness and performance:** Headless physics fairness harness with chi-square tests, physics tuning, mobile performance check with 20 dice.
   - Done: see [docs/fairness-report.md](docs/fairness-report.md) and [docs/performance.md](docs/performance.md). Dice now start spread over the whole table (20 dice settle in about 2.5 s), the d100 uses a ball shape against other dice for speed, and its numbers are shuffled onto its faces before every throw for fairness.
9. **Review:** Full test pass and a walkthrough with you, then revisit visual style and the open questions.
