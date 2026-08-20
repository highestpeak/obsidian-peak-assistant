# Vault Intelligence standalone View mock

- Status: design-only interactive mock
- Date: 2026-08-11
- Product code: unchanged
- Container direction: dedicated Obsidian main-area View, not Quick Search Modal
- Primary artifact: `index.html`
- Previous Modal preview: `preview-modal-before.jpg`
- Previous Modal enrichment preview: `preview-enrichment-modal-before.jpg`
- Companion analysis: `../../superpowers/specs/2026-08-10-vault-intelligence-capability-and-ux-redesign.md`

## What this mock demonstrates

- A persistent standalone workspace without the old `Vault Search / Vault Intelligence` modal switcher.
- `Overview / Work queue / Structure / Runs` as the top-level information architecture.
- Separate facts for local checks, machine knowledge coverage, and metadata-policy compliance.
- Summary, AI Tags, and vectors as scoped local-index enrichment operations.
- YAML/frontmatter as a proposal-first, source-locked Markdown writeback flow.
- AI Review as evidence generation with no direct Vault-file write.
- List-first structure diagnosis instead of the previous fixed-position community map.

## Interactive states

- Switch between the four workspace tabs.
- Filter and search the Work queue; select rows to update the detail inspector.
- Open `Enrich files`, inspect scope/cost/destination, and run the progress demo.
- Open `Review proposals`, select YAML candidates, and apply the demo batch.
- Open the AI Review preflight.

## Boundary

This artifact is a product-design proposal. It is not connected to the real Vault, does not call a provider, and does not write any Markdown or index data.
