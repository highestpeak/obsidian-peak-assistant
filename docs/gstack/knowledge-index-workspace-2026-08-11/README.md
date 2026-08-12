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
- Index outputs use the product's real terms: Full-text, Embeddings, Summaries, Tags and Relationships. Full-text is required; the other layers can be selected independently. Relationships automatically keeps its Embeddings dependency enabled.
- `Use recommended` restores Full-text + Embeddings. It is a shortcut, not a preset that hides or locks the underlying choices. The summary updates the selected combination, estimated duration and AI usage.
- Starting a run animates the region closed and transitions the same page into live progress. The completed state replaces the processing workspace with search and rerun actions.
- Completion distinguishes processed files from successfully indexed files. Failed and skipped documents remain visible in an expandable attention list with reason and recovery actions; they never disappear behind a nominal `100%` state.
- Automatic refresh, startup catch-up, large-change behavior, batching, retries, embedding model, summary lengths and chunking are durable controls in `Settings → Knowledge & Search`.

The default run includes Markdown, PDF, images, and Excalidraw. Plain text, CSV, JSON, HTML, and Canvas remain available but off by default. DOC/DOCX and PPT/PPTX are outside Peak's product support scope; XLSX belongs to Peak Sheet interoperability rather than ordinary document indexing. Peak Sheet and AI Graph keep separate content policies.

## Review

Open [`index.html`](./index.html) directly from its local file path. A temporary localhost server is not required.

This artifact changes documentation only. It is not a production implementation commitment.
