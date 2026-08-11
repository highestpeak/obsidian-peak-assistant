# Knowledge Index Progress View

Design-only mock for Peak Assistant's first-run and manual knowledge indexing experience.

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
- `Restart demo` restores the review state.
- The queue keeps recently completed, current, and waiting documents together so document order remains understandable.
- `4 file types` opens a compact run summary. A restrained donut chart makes the distribution visible at a glance, while the detailed rows retain exact counts, percentages, indexing behavior, and status. Hovering or focusing a chart segment highlights its corresponding detail row.
- The same summary separates types included in this run, readable types currently turned off, and Peak product data that is intentionally handled outside the ordinary document index.

The default run includes Markdown, PDF, images, and Excalidraw. DOCX, PPTX, Canvas, TXT/CSV, and machine-oriented text formats remain visible as excluded choices rather than silently disappearing. XLSX, Peak Sheet, and AI Graph are not presented as ordinary indexable document types.

## Review

Serve from the repository root and open:

`http://127.0.0.1:<port>/docs/gstack/knowledge-index-workspace-2026-08-11/index.html`

This artifact changes documentation only. It is not a production implementation commitment.
