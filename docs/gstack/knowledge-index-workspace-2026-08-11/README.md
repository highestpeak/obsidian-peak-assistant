# Knowledge Index Progress View

Design-only mock for Peak Assistant's first-run and manual knowledge indexing experience.

This is a supporting workspace in the current [Settings and Onboarding design package](../settings-onboarding-unified-2026-08-12/index.html). Settings owns durable indexing defaults; this page owns first-run setup, one run's locked choices, live progress, completion and rerun.

## Direction

The indexing job is intentionally carried by one page. It is not an index administration dashboard and it does not split progress, errors, history, file types, or folder scope into separate destinations.

The page gives priority to four questions:

1. How much has finished?
2. How fast is it moving and how long is left?
3. Which document is being processed now, and what happens next?
4. What is happening inside the current document?

Index products such as full-text records, embeddings, summaries, tags, and relationships remain visible as per-document substeps. They do not compete with the run's primary progress.

## Mocked interactions

- The run advances automatically with an accelerated demo timer.
- Overall count, percentage, ETA, speed, elapsed time, current document, substeps, queue order, and throughput graph update together.
- `Pause` freezes the run and `Resume` continues it.
- `Skip current document` advances the queue.
- The design-only state switch previews `First setup`, `Indexing`, and `Complete` without inventing product navigation.
- `Restart demo` restores the active indexing review state.
- The queue keeps recently completed, current, and waiting documents together so document order remains understandable.
- `4 file types` opens a compact run summary. A restrained donut chart makes the distribution visible at a glance, while the detailed rows retain exact counts, percentages, indexing behavior, and status. Hovering or focusing a chart segment highlights its corresponding detail row.
- The same summary separates types included in this run, readable types currently turned off, and Peak product data that is intentionally handled outside the ordinary document index.
- Index setup is an expandable region above the progress card, not a drawer. A Vault with no index opens this region first.
- The region contains only per-run choices: index outputs, file types, folder scope and optional run exclusions.
- Index outputs have two levels. The first row places `Core search` beside `Content scope`. Beneath it, `Generated knowledge` uses a full-width four-column matrix for Summaries, Tags & entities, Relationships, and Content understanding. Every output remains visible without expanding accordions.
- Summary controls are split by content type instead of using one misleading switch. Markdown summaries are available; PDF summaries, image descriptions/summaries, and Canvas/Excalidraw summaries are visibly marked `In development` until those runtime paths are actually wired.
- Tags expose local keywords, AI topic tags, functional tags, people/places/dates, and inferred dates. Relationships expose explicit Vault relations, semantic similarities, communities/Hub signals, and search-ranking signals. Content understanding separately lists extraction, OCR, and vision work.
- Each action states whether it is automatic, selectable, or unavailable. Semantic similarities automatically keep the Embeddings dependency enabled.
- Repeated descriptions do not make every row taller. Pointing to, focusing or selecting an action updates one readable explanation strip beneath the matrix; the rows themselves keep only the action name and its control state.
- `Use recommended` restores Full-text + Embeddings and required automatic actions while clearing optional enrichments. It is a shortcut, not a preset that hides or locks the underlying choices. The summary updates the selected combination, estimated duration and AI usage.
- Starting a run animates the region closed and transitions the same page into live progress. The completed state replaces the processing workspace with search and rerun actions.
- Completion distinguishes processed files from successfully indexed files. Failed and skipped documents remain visible in an expandable attention list with reason and recovery actions; they never disappear behind a nominal `100%` state.
- Automatic refresh, startup catch-up, large-change behavior, batching, retries, embedding model, summary lengths and chunking are durable controls in `Settings → Knowledge & Search`.

The default run includes Markdown, PDF, images, and Excalidraw. Plain text, CSV, JSON, HTML, and Canvas remain available but off by default. DOC/DOCX and PPT/PPTX are outside Peak's product support scope; XLSX belongs to Peak Sheet interoperability rather than ordinary document indexing. Peak Sheet and AI Graph keep separate content policies.

## Required follow-up implementation

The six actions currently labeled `Later` are required scope for this Knowledge Index work, not optional visual backlog:

- PDF summaries
- Image summaries
- Canvas & Excalidraw summaries
- Scanned PDF OCR
- Image OCR
- Image visual description

`Later` remains visible because the mock must describe the current product honestly. Each action stays disabled until it consumes real file content, records durable per-action status, appears in progress and failure recovery, supports incremental reruns, and passes focused fixture plus end-to-end Index verification. The implementation order, data boundaries and completion gates are defined in [Settings configurable capabilities by group §5.3.1](../../superpowers/specs/2026-08-12-settings-configurable-capabilities-by-group.md#531-later-是本需求的必做范围).

## Review

Open [`index.html`](./index.html) directly from its local file path. A temporary localhost server is not required.

This artifact changes documentation only. The mock itself is not production implementation, but the six required follow-up actions above are part of the accepted Knowledge Index product requirement.
