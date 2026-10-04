# Plan — Title screen, M3: design (typography, stamp, call to action, composition, motion, contrast)

**Milestone:** m3-design
**Parent feature:** [title-screen.index.md](./title-screen.index.md)
**Created on:** 2026-10-04
**Status:** pendente

---

### 1. Objective

Make the title look like the prototype on desktop and on a phone, with the owner's values for the
colours, the type and the stamp; wire the reduced-motion policy into the CSS; and prove the contrast of
every piece of text. This is the milestone the owner reviews by screenshot.

### 2. Prerequisites

- `title-screen-m2-integration` approved, with its manual list ticked.
- Identity M3 approved: the fonts are self-hosted under `frontend/public/fonts/`, and `FONT` no longer exists.

### 3. Files

| File | Operation | What changes |
|---|---|---|
| `frontend/src/title/title.css` | modify | Final styles (4.1 to 4.4) |
| `frontend/index.html` | modify | `@font-face` is not repeated here (it lives with the identity M2); the `<link>` tags to Google Fonts from the prototype are **not** added |
| `frontend/src/title/copy.test.ts` | modify | Adds: the HTML strings of `index.html` equal the constants in `copy.ts` |
| `frontend/src/title/contrast.test.ts` | create | The matrix of section 5 |
| `frontend/src/title/motion.ts` | modify (only if the CSS needs the value) | Exports the CSS-facing values as constants (no change of behaviour) |
| `frontend/src/title/title.ts` | modify | Sets `prefers-reduced-motion` from `matchMedia` and passes `motionPolicy` to the loop and to the stamp |

Not touched: the city data, the walkers and the connection logic (M1 and M2 contracts).

### 4. Contracts

#### 4.1 Colours (values, checked in section 5)

| Token | Value | Use | Contrast on `#05070f` |
|---|---|---|---|
| `--ink` | `#e6dcc4` | Title, body | 14.75 |
| `--muted` | `#9b937f` | Tagline, hint | 6.59 |
| `--stamp` | `#d9473d` | Subtitle stamp, granted stamp, the `meta` line (see below) | 4.71 |
| `--cta` | `#a8322a` | Button fill | button text `#f3ead6` on it: 5.56 |
| `--cta-edge` | `#e07a6f` | Button border | decorative |
| `--footer` | the lightest muted tone that gives ≥ 4.5 on `#05070f`, recorded by the test | Footer | ≥ 4.5 |
| `--bg` | `#05070f` | Page background (prototype value, kept) | |

Deviations from the prototype, recorded in the index as decision 9:

- `.meta` uses `--stamp` (`#d9473d`) instead of `#c8322a`. The prototype's `#c8322a` gives 3.78:1 on
  the background for 12 px text, below AA.
- `.footer` uses `--footer`, not `#6a6f80` (4.02:1).

#### 4.2 Type

- Title: `font: 400 clamp(46px, 8vw, 104px)/1 var(--title)`, letter-spacing `.04em`, shadow
  `0 2px 0 #05070f, 0 0 24px rgba(5,7,15,.9)`.
- Title family: `"Special Elite", "Courier New", monospace`, self-hosted (identity M2). Body family:
  `"IBM Plex Mono", ui-monospace, monospace`.
- Meta: 12 px, letter-spacing `.14em`. Tagline: 14 px, line-height 1.6, `max-width: 520px`.
- Stamp: `font: 400 clamp(20px, 3.2vw, 34px)/1 var(--title)`, letter-spacing `.38em`, border 3 px
  `--stamp`, rotated −4°, opacity `.92`.
- Button: `font: 600 18px/1 var(--body)`, letter-spacing `.06em`, padding `16px 34px`, border 2 px
  `--cta-edge`, hard shadow `4px 4px 0 rgba(0,0,0,.45)`. Hover fill `#b93a31`. Active: translate
  `2px 2px` and shadow `2px 2px`. Focus-visible outline 2 px `--ink`, offset 4 px.
- Hint: 11 px, letter-spacing `.08em`, `--muted`.
- Footer: 11 px, flex, space-between, 16 px side gutters, `bottom: 12px`.

#### 4.3 Stamp "PARTIDA AUTORIZADA"

- Position: centred. `transform: translate(-50%, -50%) rotate(-8deg)`.
- Font: `400 clamp(26px, 5vw, 54px)/1 var(--title)`, letter-spacing `.12em`, border 5 px `--stamp`,
  colour `--stamp`, background `rgba(5,7,15,.35)`, padding `10px 22px 6px`, `white-space: nowrap`.
- Motion: driven by `stampAt` (M1). The CSS sets the transform from the value the loop computes, using
  `scale` and `opacity`. In the reduced policy the scale is fixed at `1` and only the opacity moves over the
  same timings.
- `pointer-events: none`.

#### 4.4 Composition

- The title block is centred. The shade is the prototype's two radial gradients: `radial-gradient(ellipse 44% 30% at 50% 44%, rgba(5,7,15,.82), rgba(5,7,15,.3) 62%, transparent 82%)` and the vignette `radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,.6) 100%)`.
- Breakpoints (the prototype's behaviour, made explicit):
  - Landscape, width ≥ 700 px: as the prototype (`padding-bottom: 6vh`).
  - Portrait or width < 700 px: the title block is top-aligned with `padding-top: 14vh`, the button is full width up to 360 px, and the title uses the lower bound of its clamp (46 px). The city canvas is still full-screen; the walkers keep their positions.
  - `env(safe-area-inset-*)` is applied to the `:root` padding, as in the prototype.
- No horizontal scroll at 390 px wide: `html, body { overflow: hidden }`, and the longest line (the tagline) wraps.

#### 4.5 Reduced motion

- `title.ts` reads `matchMedia('(prefers-reduced-motion: reduce)')` at boot and on change, and computes `motionPolicy(reduced)`.
- CSS: `@media (prefers-reduced-motion: reduce) { .cta, .stamp, .granted { transition: none } }` and the stamp gets no scale transition, as the policy says.
- The walkers and ambient are off in the policy, so the canvas draws the still frames. The owner checks it with the OS setting turned on.

### 5. Tests planned

**`contrast.test.ts`** (Node, uses `view/contrast.ts`):
- [ ] `--ink` on `--bg` ≥ 7.
- [ ] `--muted` on `--bg` ≥ 4.5.
- [ ] `--stamp` on `--bg` ≥ 4.5 (the meta line).
- [ ] `#f3ead6` on `--cta` ≥ 4.5 (button text). The prototype value gives 5.56.
- [ ] `--footer` on `--bg` ≥ 4.5; the test records the chosen value.
- [ ] `--ink` on `--cta` ≥ 4.5 (the hover and focus state of the button keeps the text).
- [ ] `--stamp` on `--bg` ≥ 3 (the granted stamp is large text).

**`copy.test.ts`** (extended):
- [ ] Every string constant of `copy.ts` appears verbatim in `frontend/index.html`.
- [ ] `index.html` has no `fonts.googleapis.com` or `fonts.gstatic.com` link.

**Manual (owner, screenshots attached to the PR):**
- [ ] Desktop 1440×860: title block, tagline, button and footer match the prototype's `screenshots/title-screen.png` in position and proportion.
- [ ] After pressing: the stamp slams in and fades (compare with `title-screen-start.png`).
- [ ] Phone 390×844 in portrait: the whole title is visible, the button is tappable, nothing scrolls sideways, the characters are visible around the button (compare with `title-screen-mobile.png`).
- [ ] Keyboard only: Tab reaches the button with a visible focus ring; Enter starts it.
- [ ] OS reduced motion on: walkers do not move, no ambient plays, the stamp only fades, the button does not animate its press.
- [ ] Phone in landscape (844×390): the title and button fit without cropping.

### 6. Dependencies

- M2 approved.
- Identity M3 approved.
- Nothing downstream. This is the last milestone of the feature.

### 7. Execution steps

1. Write `contrast.test.ts` first. Compute the footer value and write it into the test.
2. Write `title.css` from the values in 4.1 to 4.5.
3. Extend `copy.test.ts`; fix any HTML string that differs.
4. Wire the reduced-motion policy in `title.ts`.
5. Run `npm test -w @eldritch-alley/frontend` and `npm run build -w @eldritch-alley/frontend`.
6. Take the desktop, stamp, phone portrait and phone landscape screenshots and attach them to the PR.

### 8. Acceptance

- [ ] Automated checks pass.
- [ ] Owner's manual list ticked in the PR, with the four screenshots.
- [ ] The two deviations from the prototype (meta colour, footer colour) are listed in the PR description.
- [ ] `backend/` unchanged.

### 9. Out of scope

- A back view of the characters (not in the prototype; noted as its known limit).
- Any extra stamp or decoration (the prototype's "AUTORIZADO" stamp belongs to the map screen, not to the title).
- A language change. The UI stays in Portuguese, as in the rest of the client.
- Analytics or any network call beyond the connection.
