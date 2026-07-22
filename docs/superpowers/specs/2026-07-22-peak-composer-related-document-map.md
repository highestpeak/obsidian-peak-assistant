# Peak Composer Related Document Map

Date: 2026-07-22
Status: handoff map for the next Composer + Intelligence requirements task

## Purpose

This document organizes the artifacts from the Peak Composer editing-view discussion and the earlier Copilot, Ambient, Chat Studio, File Atlas, and AI-surface sessions.

Use it before starting a new implementation or requirements session. The goal is not to read everything. The goal is to know which documents are source of truth, which are visual evidence, and which are older background that should not override the latest Composer direction.

## Immediate Handoff Target

The next task should integrate the latest sidecar / Intelligence design with the Composer editing view and turn the combined result into a clear product requirement.

Current decision and execution handoff:

- [`2026-07-22-peak-composer-intelligence-sidecar-handoff.md`](../plans/2026-07-22-peak-composer-intelligence-sidecar-handoff.md)

Primary review URL:

`file:///Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/docs/gstack/peak-composer-editing-view-2026-07-09/index.html?mode=copilot&stage=brief`

Primary local artifact folder:

`docs/gstack/peak-composer-editing-view-2026-07-09/`

## Source Of Truth Order

1. Current integrated mock and its README.
2. The July Composer specs: editing view, block AI capability contract, Intelligence sidecar UI.
3. The sidecar / lab files in the same Composer artifact folder.
4. User feedback embedded in the current conversation and browser comments.
5. Earlier Copilot, Ambient, Chat Studio, and AI-surface documents as background patterns only.
6. `docs/progress.md` for current project phase and implementation state.

When documents conflict, the later Composer-specific docs win. Older Copilot Command Center and Ambient Push artifacts provide concepts and visual vocabulary, not the final current layout.

## Current Composer Artifacts

These are the must-read files for a new session.

- `docs/gstack/peak-composer-editing-view-2026-07-09/README.md`  
  Entry point and current source-of-truth boundaries for the mock.
- `docs/gstack/peak-composer-editing-view-2026-07-09/index.html`  
  Integrated owner-review mock for the Composer view.
- `docs/gstack/peak-composer-editing-view-2026-07-09/mock.css`  
  Main document canvas, block controls, native object, table, image, formula, and inline AI styles.
- `docs/gstack/peak-composer-editing-view-2026-07-09/mock.js`  
  Block interaction fixtures, AI menu behavior, generated drafts, object transforms, native renderers, and focused-block projection.
- `docs/gstack/peak-composer-editing-view-2026-07-09/intelligence.css`
- `docs/gstack/peak-composer-editing-view-2026-07-09/intelligence-panel.js`  
  Current shared static-mock source for the Intelligence shell.
- `docs/gstack/peak-composer-editing-view-2026-07-09/intelligence-lab.html`
- `docs/gstack/peak-composer-editing-view-2026-07-09/intelligence-lab.css`
- `docs/gstack/peak-composer-editing-view-2026-07-09/intelligence-lab.js`  
  Small-DOM sidecar debugging host. Use it to iterate sidecar IA without repeatedly reading the large integrated mock.
- `docs/gstack/peak-composer-editing-view-2026-07-09/intelligence-ia-lab.html`
- `docs/gstack/peak-composer-editing-view-2026-07-09/intelligence-ia-lab.css`
- `docs/gstack/peak-composer-editing-view-2026-07-09/intelligence-ia-lab.js`
- `docs/gstack/peak-composer-editing-view-2026-07-09/intelligence-ia-lab.qa.mjs`  
  Isolated IA acceptance and comparison harness. The `adaptive` route is the current selected acceptance fixture; `staged` and `hybrid` remain comparison / regression evidence and must not redefine the shared sidecar.
- `docs/gstack/peak-composer-editing-view-2026-07-09/copilot-ambient-consolidation-review-2026-07-17.md`  
  Notes on how Copilot and Ambient were consolidated for the sidecar.

## Current Composer Specs

These define the product contract behind the mock.

- `docs/superpowers/specs/2026-07-09-peak-composer-editing-view.md`  
  Core Composer editing-view product direction: a switchable Obsidian view over Markdown/native files, not a Notion clone.
- `docs/superpowers/specs/2026-07-15-composer-block-ai-capability-contract.md`  
  Block/core operation matrix: fixed actions vs Copilot review suggestions vs incremental native generation.
- `docs/superpowers/specs/2026-07-15-composer-intelligence-sidecar-ui.md`  
  Sidecar UI contract and interaction boundary.

Related implementation / extraction plan:

- `docs/superpowers/plans/2026-07-21-vault-result-browser-shared-component.md`  
  Production Vault Result Browser extraction plan referenced by the Composer sidecar. Use this when related-material UI needs the real List / Folder / Graph browser instead of a mock clone.

## Visual Evidence In Current Composer Folder

Do not open every preview image by default. Use these only when checking a specific interaction.

- `preview-block-granularity.png` and `preview-block-kind-separation.png`  
  Evidence for title / paragraph / list / quote / callout as distinct editable blocks.
- `preview-hover-controls.png`, `preview-hover-corridor.png`, `preview-insert-under-block.png`, `preview-comment-editor.png`  
  Evidence for block control reachability, click-to-toggle insertion/comment behavior, and hover corridor issues.
- `preview-blockai-capsule.png`, `preview-blockai-input-morph.png`, `preview-blockai-combined.png`, `preview-contextual-ai-actions.png`  
  Evidence for the block AI capsule / command / suggestion model.
- `preview-blockai-inplace-diff.png`, `preview-blockai-rewrite-accepted.png`, `preview-ai-streaming.png`, `preview-ai-stream-busy.png`, `preview-ai-stream-done.png`  
  Evidence for streaming, in-place rewrite, and accept/reject review.
- `preview-image-lightgallery.png`  
  Evidence for LoveIt-style `lightGallery` image viewing.
- `preview-atlas-mermaid.png`, `preview-native.png`, `preview-native-followup-content.png`  
  Evidence for Mermaid / Base / Canvas / Excalidraw style native-object handling.
- `preview-intelligence-copilot-v3.png`, `preview-intelligence-ambient-v3.png`, `preview-intelligence-history-v3.png`  
  Earlier sidecar screenshots. Use only as historical comparison unless the current integrated mock matches them.

## Native File And Real Data Fixtures

These are important because the Composer view must preserve original Markdown/native formats.

- `docs/gstack/peak-composer-editing-view-2026-07-09/assets/real-map-auckland-route.png`  
  Real image fixture used for the image block and lightGallery path.
- `docs/gstack/peak-composer-editing-view-2026-07-09/assets/pkm-composer.base`
- `docs/gstack/peak-composer-editing-view-2026-07-09/assets/Untitled.base`  
  Base examples.
- `docs/gstack/peak-composer-editing-view-2026-07-09/assets/pkm-composer.canvas`  
  JSON Canvas sample.
- `docs/gstack/peak-composer-editing-view-2026-07-09/assets/101-A-产品类别分析.excalidraw.md`  
  Excalidraw sample with real text elements.
- `docs/gstack/peak-composer-editing-view-2026-07-09/assets/ai-knowledge-workflow-illustration.png`  
  Generated illustration fixture for AI image insertion and review.

## Research From The Composer Session

These explain why Composer focuses on block-level editing, rich objects, images, tables, and AI-local editing.

- `docs/research/2026-07-09-obsidian-editor-view-ui-plugins/report.md`  
  Obsidian editor-view and UI plugin research.
- `docs/research/2026-07-09-open-source-editor-ui-tools/report.md`  
  Open-source editor UI / block editor tool research.
- `docs/research/2026-07-09-ai-surfaces-ui-review/README.md`
- `docs/research/2026-07-09-ai-surfaces-ui-review/01-ai-search.html`
- `docs/research/2026-07-09-ai-surfaces-ui-review/02-vault-intelligence.html`
- `docs/research/2026-07-09-ai-surfaces-ui-review/03-document-copilot.html`  
  AI surfaces review; useful for sidecar and Copilot language.
- `docs/research/2026-07-09-collection-notes-canvas-reuse/README.md`  
  Notes on reusing collection / canvas style ideas.

## Copilot Command Center Background

These are older but still useful for capability organization, run receipts, command discovery, diff review, and action orchestration.

- `docs/gstack/copilot-command-center-redesign-2026-05-14/README.md`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/brief.md`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/final-ux-flow.html`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/final-ux-flow-screenshot.png`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/evolution-report.md`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/evolution-report-rendered.html`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/intent-hub-auto-orchestration-review.md`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/multi-panel-surface-review.md`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/prototypes/capability-visual-gallery.html`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/prototypes/command-center-prototype.html`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/prototypes/intent-hub-orchestration-prototype.html`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/prototypes/full-document-rendered-diff-prototype.html`

Associated specs and plans:

- `docs/superpowers/specs/2026-05-14-copilot-command-center-user-centered-redesign.md`
- `docs/superpowers/specs/2026-05-16-copilot-command-center-final-ux-flow.md`
- `docs/superpowers/specs/2026-05-17-copilot-meta-agent-redesign.md`
- `docs/superpowers/plans/2026-05-14-copilot-command-center-user-centered-redesign.md`
- `docs/superpowers/plans/2026-05-16-copilot-command-center-final-ux-flow.md`
- `docs/superpowers/plans/2026-05-16-copilot-panel-flow-implementation.md`

Important boundary: do not copy the old command-center dashboard into Composer. Composer needs a document-adjacent sidecar and in-place document patches.

## Document Copilot Background

These define older document-copilot and agent-loop thinking.

- `docs/16-feature-document-copilot.html`
- `docs/superpowers/specs/2026-04-24-copilot-document-intelligence-design.md`
- `docs/superpowers/plans/2026-04-24-copilot-document-intelligence.md`
- `docs/superpowers/specs/2026-05-07-copilot-expansion-design.md`
- `docs/superpowers/plans/2026-05-07-copilot-expansion.md`
- `docs/superpowers/specs/2026-05-10-copilot-agent-loop-design.md`
- `docs/superpowers/plans/2026-05-10-copilot-agent-loop.md`

Use these for capability semantics, not for current UI layout.

## Ambient / Current Work State Background

These are needed because the sidecar keeps using Ambient ideas, but the user does not want a generic enterprise dashboard.

- `docs/14-feature-ambient-push.html`
- `docs/superpowers/specs/2026-05-01-ambient-push-design.md`
- `docs/superpowers/plans/2026-05-01-ambient-push-phase1.md`
- `docs/superpowers/plans/2026-05-10-ambient-push-phase2.md`
- `docs/superpowers/plans/2026-05-10-ambient-push-phase3.md`
- `docs/superpowers/plans/2026-05-10-ambient-push-phase4.md`
- `docs/superpowers/specs/2026-06-02-ambient-push-current-work-state-product-technical-review.html`
- `docs/gstack/ambient-current-work-state-2026-06-02/ambient-current-work-state-v1.png`
- `docs/gstack/ambient-current-work-state-2026-06-02/ambient-session-thought-trace-v1.png`
- `docs/superpowers/specs/2026-07-07-ambient-floating-panel.html`

Concept mapping for Composer:

- Current Work State: why the system thinks the user is currently writing / reviewing / organizing this document.
- Recent Work Trace: evidence behind that inference.
- Session Thought Trace: loose ideas and not-yet-placed thoughts for the current writing session.
- Ambient Push: ranking and initiative layer behind Copilot, not a separate editor.

## Chat Studio And Input Composer References

Use these when designing the sidecar Copilot input, capability picker, action chips, model/runtime affordances, and conversation threading.

- `docs/11-feature-chat-studio-ui-ux.html`
- `docs/11-feature-chat-context.html`
- `docs/gstack/chat-studio-interactive-2026-07-13/README.md`
- `docs/gstack/chat-studio-interactive-2026-07-13/discussion-synthesis.md`
- `docs/gstack/chat-studio-interactive-2026-07-13/research-and-inventory.md`
- `docs/gstack/chat-studio-interactive-2026-07-13/composer-lab.html`
- `docs/gstack/chat-studio-interactive-2026-07-13/product-strategy.html`
- `docs/gstack/chat-studio-interactive-2026-07-13/index.html`
- `docs/superpowers/specs/2026-07-14-chat-studio-product-positioning-and-composer-v2.md`
- `docs/superpowers/specs/2026-07-15-chat-studio-complete-implementation-spec.md`
- `docs/superpowers/plans/2026-07-13-chat-studio-interactive-html-mock-plan.md`
- `docs/superpowers/plans/2026-07-21-chat-zero-gap-closure-delivery.md`
- `docs/superpowers/plans/2026-07-21-chat-zero-gap-closure-claude-handoff.md`

Boundary: Chat Studio can inspire the Copilot composer and capability picker, but Composer View is still a document editing surface.

## File Atlas / Related Material References

These matter because Composer should not duplicate Atlas outline/search/gallery/comment columns, and related-material expansion should reuse real graph/search surfaces.

- `docs/gstack/file-atlas-mock-2026-07-08/index-v3.html`
- `docs/gstack/file-atlas-mock-2026-07-08/preview-v3.png`
- `docs/gstack/file-atlas-mock-2026-07-08/preview-v3-graph.png`
- `docs/gstack/file-atlas-mock-2026-07-08/preview-v3-search-tray.png`
- `docs/gstack/file-atlas-mock-2026-07-08/preview-v3-insight-inspector.png`
- `docs/23-infra-search-index.html`

Boundary: Composer should expose a bounded relation preview in the sidecar and then open the production Vault Result Browser / Atlas surface for full navigation.

## Product Index And Progress References

- `docs/index.html`  
  Long-term docs portal.
- `docs/roadmap.html`  
  Roadmap surface; use it when converting the Composer requirements into roadmap tracks.
- `docs/progress.md`  
  Current project phase and recent implementation status. Read before making implementation claims.

## Recommended Reading Order For A New Task

1. Open the primary review URL and inspect the current screen.
2. Read this document map.
3. Read `docs/gstack/peak-composer-editing-view-2026-07-09/README.md`.
4. Read the three July Composer specs.
5. Read only the background pack needed for the current question:
   - sidecar / capabilities: Copilot Command Center + Chat Studio input composer docs;
   - Ambient semantics: Ambient / Current Work State docs;
   - related materials: File Atlas / Vault Result Browser docs;
   - native objects: current Composer fixture assets and README.
6. Write one integrated requirements document for Composer + sidecar, then update the current mock or open a fresh implementation task.

## Conflict Rules

- Do not reintroduce a three-column outline/search/gallery/comment layout inside Composer. Atlas owns that.
- Do not treat Ambient as a third permanent chat tab unless the latest sidecar design explicitly reintroduces it.
- Do not turn AI suggestions into explanatory cards when the action can be rendered as an in-place patch, real inserted object, real transformed table, rendered formula, native file patch, or generated image.
- Do not use old Command Center dashboard density as the sidecar style target.
- Do not use Chat Studio conversation surfaces as proof that Composer should stop being document-first.
- Do not duplicate production related-material browser UI in static Composer mock; mark the reuse slot and link to the real component plan.
- Do not read all preview PNGs by default. Pick the screenshots that match the specific design question.

## Requirement Work To Produce Next

The next requirements document should be separate from this map. Suggested future path, not created yet:

`docs/superpowers/specs/2026-07-22-peak-composer-integrated-requirements.md`

Suggested sections:

1. Product contract: Composer View + Intelligence sidecar as one document editing experience.
2. Composer document canvas: block granularity, selection, insertion, comments, drag, Markdown/native source preservation.
3. Block/core capability matrix: fixed operations, AI review suggestions, incremental native generation, manual commands.
4. Copilot sidecar: capability picker, context chips, chat composer, run snapshot, live patch navigation.
5. Ambient projection: current work state, related materials, loose thoughts, confidence / evidence.
6. History: accepted transactions, rollback, diff, provenance.
7. Native object adapters: image, table, formula, Mermaid, Base, Canvas, Excalidraw.
8. Responsive behavior: stable right sidecar on wide screens; fixed, closeable right drawer on narrow screens. It must never fall below the document or become a bottom sheet.
9. Roadmap: shipped in mock, ready to implement, needs production adapter, future exploration.
10. Verification checklist: visual QA, no horizontal overflow, source format preserved, cross-block selection, object actions, sidecar states.

## Short Copyable Handoff

Use this if starting a fresh task:

```text
We need to integrate the latest Peak Composer editing-view mock with the latest Intelligence sidecar design and turn the combined system into a product requirements document plus any necessary mock cleanup.

Start from:
- docs/superpowers/plans/2026-07-22-peak-composer-intelligence-sidecar-handoff.md
- docs/superpowers/specs/2026-07-22-peak-composer-related-document-map.md
- docs/gstack/peak-composer-editing-view-2026-07-09/README.md
- docs/gstack/peak-composer-editing-view-2026-07-09/index.html?mode=copilot&stage=brief
- docs/superpowers/specs/2026-07-09-peak-composer-editing-view.md
- docs/superpowers/specs/2026-07-15-composer-block-ai-capability-contract.md
- docs/superpowers/specs/2026-07-15-composer-intelligence-sidecar-ui.md

Do not restart from generic Notion/Feishu cloning. Composer is a switchable Obsidian view over Markdown and native files. Atlas owns outline/search/gallery/comment navigation. The document canvas is primary; Copilot/Ambient/History support in-place editing, source-preserving native object patches, and accepted transaction history.

First audit the current mock and latest sidecar design, then write docs/superpowers/specs/2026-07-22-peak-composer-integrated-requirements.md. After that, update the mock only where it makes the integrated requirement clearer.
```
