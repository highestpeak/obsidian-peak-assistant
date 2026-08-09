# Peak landing full-bleed refinement

Owner-directed visual refinement after the approved landing-page reconstruction.

## Design decision

- Keep copy, calls to action, screenshots, and product diagrams inside the existing 1200px reading grid.
- Let ambient color, section separators, constellation fields, and wave motion span the viewport.
- Keep the hero constellation biased toward the right so it reads as a visual system without competing with the main message.
- Reduce the hero field on narrow screens and preserve a zero-overflow mobile layout.
- This is an intentional refinement of the supplied reference, not a new claim of pixel-identical parity with that file.

## Verification

- Desktop viewport: 1440 x 900.
- Mobile viewport: 390 x 844.
- `peak-constellation`, `pitch-w1`, `pitch-w2`, `pitch-w4`, and `peak-constellation-close` each measured exactly one viewport wide on desktop.
- Desktop document width: 1440px; mobile document width: 390px.
- Mobile overflowing element count: 0.
- Two mobile viewport captures 800ms apart produced different hashes with reduced motion disabled, confirming active motion.
- Browser console warnings/errors: none.

## Captures

- `screenshots/desktop-hero.png`
- `screenshots/desktop-studio.png`
- `screenshots/desktop-terms.png`
- `screenshots/mobile-hero.png`
