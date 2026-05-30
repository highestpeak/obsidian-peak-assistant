# Reference images

Six AI-generated direction images used as visual scaffolding for the mock package.
Treat them as **layout / language references**, not as targets to reproduce pixel-for-pixel.
The HTML/CSS mocks rebuild the same ideas with primitives we can iterate on.

All images live in (Codex generated images bucket):

```
/Users/zhangjike/.codex/generated_images/019e71fe-9f64-7030-8b8a-2af1688d3e5f/
```

| # | Mock screen                  | Reference image filename                                                          | What we took from it                                                                                                    |
|---|------------------------------|-----------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------|
| 1 | `1-overview.html`            | `ig_0804bbf1ddcecddf016a191b159a8c8191912db453420873ff.png`                       | KPI strip with verbs (Budget pace / Context risk / MPG / Calls). Recommended-actions list as the new headline.          |
| 2 | `2-provider-model.html`      | `ig_0804bbf1ddcecddf016a191b5a059c8191a51243e1cb0b4747.png`                       | Table-first layout with full provider+model names; cost-by-provider stacked bar; footer insight banner ending in verbs. |
| 3 | `3-outcome-value.html`       | `ig_0804bbf1ddcecddf016a191befe4d881918cee46fea33e3080.png`                       | MPG KPIs, outcome breakdown table, calls → value funnel, high-spend-no-outcome trace list.                              |
| 4 | `4-budget-alerts.html`       | `ig_0804bbf1ddcecddf016a191c3ed59c81918434393827dd504b.png`                       | Three-column structure: monthly budget input, alert rules toggles, model defaults (Quick / Deep / Premium). |
| 5 | `5-history.html`             | `ig_0804bbf1ddcecddf016a191d04aab081919f553800491d86cd.png`                       | Dense call table + sticky right-side detail panel with token / cost / metadata sub-tabs.                                |
| 6 | `6-optimization.html`        | `ig_0804bbf1ddcecddf016a191d662da88191895e1eb3d27131c6.png`                       | Numbered recommendation blocks with Apply/Preview verbs; projected spend panel; Conservative / Balanced / Aggressive scenarios. |

## Things we deliberately did **not** carry over

- The reference images use heavier mauve / desaturated purple gradients in places; the mocks dial that back to neutral surfaces with restrained accents only.
- The reference fonts and sizes are larger and more marketing-feeling; mocks use tighter density to match a tool surface inside Obsidian.
- A couple of charts in the references are decorative ("blob" SVG, glowy bars); mocks replace them with explicit value-labeled CSS bars and SVG sparklines.
