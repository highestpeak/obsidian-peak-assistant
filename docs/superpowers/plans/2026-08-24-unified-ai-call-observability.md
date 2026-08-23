# Unified AI call observability implementation plan

## Requirement traceability

| Goal | Evidence | Implementation | Validation |
| --- | --- | --- | --- |
| Log before send | Finished-only `DebugTraceRecorder` | Active call records plus subscriptions | Recorder lifecycle test |
| Log raw provider result | Optional feature callbacks | AI SDK middleware at execution boundary | Middleware stream/generate tests |
| Cover every AI surface | Harness, direct Vercel, embedding and media paths | Shared port plus explicit DI | Source coverage audit |
| Do not hide failures | Empty-response incident | Observer records then rethrows original error | Failure propagation tests |
| User can inspect without reproducing | Advanced Settings has only mode and clear | Recent AI calls inspector | Settings contract and real Obsidian QA |

## Execution order

1. Extend `core/debug-trace` with active model-call records, handles, subscriptions, redaction and structured console logging.
2. Add an AI SDK language-model middleware that observes `doGenerate` and `doStream` without consuming or mutating caller-visible output.
3. Inject the app-owned debug port into `AIServiceManager`, `ConversationService`, Harness callers, direct Vercel callers, embedding, and media composition.
4. Add the Diagnostics call inspector with status, route, duration, request, response, reasoning, usage, finish reason, error, copy, and clear.
5. Add an automated production-call coverage audit.
6. Run focused tests and production build.
7. Reload only the plugin and verify one active and one failed call through CDP when a listener is available.

## Stop and rollback rules

- Do not change provider selection or model fallback behavior.
- Do not store raw binary or unsanitized credentials.
- If instrumentation changes streamed output, abort and revert the middleware path.
- If a call site cannot receive the app-owned port without a service-to-app dependency, add a narrow constructor/request port; do not use `AppContext.getInstance()` or a module-level runtime singleton.
- Commit only this task's files; Peak Sheet work already present in the working tree is protected and must remain unstaged.
