# Usage Dashboard mock package · 2026-05-29

HTML/CSS mock for the Usage Dashboard rework. Six independent screens that translate the directions in
[`docs/superpowers/specs/2026-05-29-usage-dashboard-insights.md`](../../superpowers/specs/2026-05-29-usage-dashboard-insights.md)
into something we can iterate on visually before any spec / PR work.

## Scope (this round)

- **Mock only.** Nothing under `src/`, `main.ts`, `styles/`, React components, SQLite schema, or settings schema is touched.
- **Not real data.** All numbers, names, and traces are illustrative.
- **Not a final visual.** Background, density, palette, and copy are first-pass; next round will harden them with Playwright iteration.

## How to open

Any of these works:

```bash
# 1. file:// — no server needed
open docs/gstack/usage-dashboard-mockups-2026-05-29/index.html

# 2. simple static server (Python 3)
cd docs/gstack/usage-dashboard-mockups-2026-05-29
python3 -m http.server 4173
# then http://localhost:4173/index.html

# 3. simple static server (Node, no deps)
npx --yes serve docs/gstack/usage-dashboard-mockups-2026-05-29
```

No npm dependencies added.

## File layout

```
usage-dashboard-mockups-2026-05-29/
├── README.md                  ← this file
├── reference-images.md        ← the 6 source images and what each is for
├── index.html                 ← entry: links into the 6 screens
├── styles.css                 ← shared dark design tokens + primitives
├── partials.js                ← shared nav, no framework
├── 1-overview.html            ← Usage Intelligence
├── 2-provider-model.html      ← Provider & Model breakdown
├── 3-outcome-value.html       ← MPG / outcome value
├── 4-budget-alerts.html       ← Budget & alert rules + model defaults
├── 5-history.html             ← Descended dashboard / trace drilldown
└── 6-optimization.html        ← Recommendations + scenario chooser
```

## How the screens map to the insights spec

| Screen                | Spec section | Role                                                                |
|-----------------------|--------------|---------------------------------------------------------------------|
| 01 · Usage Intelligence | §6.1 default surface · JTBD 1/3/4 | Replaces the old KPI wall with action-oriented carrier mix. |
| 02 · Provider &amp; Model | §1.4 truncation fix · §6.2 Curator inputs | Table-first; provider+model names not truncated. |
| 03 · Outcome Value    | §4.3 MPG metric · §7 `usage_outcome` | Cost-per-outcome metrics + value funnel. |
| 04 · Budget &amp; Alerts | §6.2 budget settings + alert rules + model defaults | Set-and-forget guardrails + "what users will see" preview. |
| 05 · Usage History    | §6.1 G (descended dashboard) · JTBD 6 | Old dashboard demoted to audit / trace drilldown surface. |
| 06 · Usage Optimization | §6.2 Curator runtime · §5 anti-pattern #5 | Highest leverage — recommendations carry verbs and projected savings. |

## Design choices in this pass (call out for review)

- **Dark, restrained palette.** Aligns with Obsidian default and matches the visual language of the reference images. The user said dark was optional; we picked dark because every reference shipped dark and the screens read as "operations console" not "marketing dashboard."
- **Numbers always carry verbs.** Each KPI ends with a `→` link or an "Apply / Open trace / Compact" button. Anti-pattern #5 (transparency without agency) is the loudest failure mode in the spec.
- **No truncated provider/model names.** Long names wrap or display fully. The user's original complaint about by-provider/model display drove this.
- **Charts are CSS/SVG only.** No chart library, no build step. This keeps mocks editable and `file://`-openable.
- **The old dashboard isn't deleted, it's descended.** Screen 05 is what the current panel becomes — a secondary audit/debug surface, not the default view.
- **MPG metrics surfaced as first-class.** Screen 03 makes cost-per-saved-artifact and cost-per-useful-click the headline, per §4.3 of the spec.

## Known gaps to fix in the next pass

- Light-theme variant not authored. Will be needed to validate against Obsidian Light.
- No responsive treatment below ~1080 px tested by hand. Mobile / narrow-leaf behavior is out of scope for this round.
- "Status bar pip" and "inline per-message receipt" (Cline-style carriers) are referenced from the Overview but not drawn — they live in chat, not the dashboard, so they belong in a chat-surface mock.
- Copy is illustrative; needs an editorial pass before becoming user-facing strings.
- Empty / zero-data states are not drawn. Worth adding before the spec phase.

## Next step

1. Review the six screens with the user, capture which directions to keep.
2. Use Playwright to iterate visuals: screenshot per width, check spacing, density, truncation. Surface regressions screen by screen.
3. Once the visual direction is approved, fold into a formal spec (`docs/superpowers/specs/2026-XX-XX-usage-dashboard-spec.md`) covering data layer additions (`usage_outcome`, budget settings), Curator runtime input/output, and PR breakdown.
4. Only then touch `src/`.

## Reference

- Insights report: [`docs/superpowers/specs/2026-05-29-usage-dashboard-insights.md`](../../superpowers/specs/2026-05-29-usage-dashboard-insights.md)
- Source images: see [`reference-images.md`](./reference-images.md)
