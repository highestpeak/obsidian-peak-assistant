# Codex Review: T11N Remaining Boundary Tail Investigation

Source investigation:
- Attachment from Claude Code: T11N read-only investigation for remaining 95 boundary findings.

Verdict:
- **Approved for implementation, with required corrections.**

Owner-facing summary:
- The investigation is good enough to proceed.
- The next implementation should be judged primarily on **raw UI vault/editor operation reduction**, not only on `total flagged`.
- The honest finding is important: many remaining `UI -> app` edges are legitimate Obsidian app-shell wrappers and should be documented or left alone, not hidden behind a fake god context.

## 1. What Codex Verified

Codex reran:

```bash
npm run audit:boundary -- --out /tmp/t11n-codex-baseline.md
rg -n "\bapp\.vault\.(read|modify|create|trash|cachedRead|readBinary)|\bapp\.workspace\.activeEditor|\bapp\.fileManager\.|\bapp\.workspace\.openLinkText" src/ui
rg --files src/core src/service/chat | rg "(types/chat|chat/types|service/chat/types)"
rg -n "ChatConversation|ChatMessage|ChatProject" src/service/chat/types.ts src/core/eventBus.ts src/core/storage/vault/ChatStore.ts
```

Confirmed baseline:
- Boundary audit still reports `95` findings.
- Raw UI vault/editor scan reports 20 matches in `src/ui`.
- `src/core/types/chat.ts` already exists.
- `ChatMessage`, `ChatProject`, and most pure chat types already live in `core/types/chat.ts`.
- The remaining `core -> upstream` issue is specifically `ChatConversation`, which still lives in `src/service/chat/types.ts` because it carries an Obsidian `TFile`.

## 2. Approval

Approved tracks:

| Track | Decision | Notes |
| --- | --- | --- |
| Vault preview port | Approved | Good fit for `WikilinkHoverPreview` and `resource-preview-hover`. |
| Vault open / editor insert operation | Approved with shape correction | Must be a narrow grouped port, not loose top-level `ServiceContext` methods. |
| Chat save-to-vault port | Approved | Keep UsageOutcomeService behavior and error handling. |
| Copilot modal cachedRead cleanup | Approved | Reuse existing Copilot panel app adapter/composer. |
| SearchModal saved-analysis read through host | Approved | Replace direct `app.vault.read` with existing host operation. |
| `useStreamdownWikilinkClick` fallback removal | Conditional | Only if all call sites can be updated safely. |
| Core chat type relocation | Approved with shape correction | Do not blindly move TFile-bearing `ChatConversation` into pure `core/types/chat.ts`. |
| Quick Search port implementation relocation | Optional | Nice symmetry, but not required for acceptance. |
| UI app-shell exception doc | Optional | Useful for owner comprehension, but do not add scanner allowlists. |

## 3. Required Corrections Before Implementation

### Correction A: Do not add loose operations directly to `ServiceContext`

Claude proposed:

```text
openVaultLink(path, opts) + insertWikilinkAtCursor(label) on ServiceContext
```

Codex correction:
- Do not add loose top-level functions to the shared context.
- Add narrow grouped ports and publish those through `ServiceContext`.

Preferred shape:

```text
vaultPreview.readText/readBinary/getResourcePath
vaultNavigation.openLink
editorCommands.insertWikilinkAtCursor
chatVaultWriter.saveChatMessageToFolder
```

Composition rule:
- Compose app adapters in app-owned code (`src/app/**`, `ReactElementFactory`, or an app composition helper).
- `ServiceContext` should publish injected ports. Do not make `ServiceContext` the place that keeps constructing more app adapters as a hidden fallback.

Reason:
- This avoids turning `ServiceContext` into a broader god context.
- It matches the existing Copilot panel adapter pattern without repeating the T11M caveat.

### Correction B: Be careful with `ChatConversation`

`src/core/types/chat.ts` already exists.

Current state:
- Pure chat types mostly already live in `src/core/types/chat.ts`.
- `src/service/chat/types.ts` still defines `ChatConversation` because it includes `file: TFile`.
- `src/core/eventBus.ts` and `src/core/storage/vault/ChatStore.ts` import that service type, causing the last `core -> upstream = 2`.

Codex correction:
- Do not create a new `core/types/chat.ts`.
- Do not casually pollute pure `core/types/chat.ts` with a TFile-bearing type unless there is no cleaner option.

Preferred options:
- Create an explicitly vault-backed type file, for example `src/core/types/chat-vault.ts`, with a warning that it includes Obsidian file handles.
- Or split the structural conversation fields from the live `TFile` handle.
- Keep `src/service/chat/types.ts` as a compatibility re-export if needed.

Acceptance condition:
- `core -> upstream` must become `0`.
- `service/core -> Obsidian types` must not rise above the current T11M/T11N floor of `35`.

### Correction C: Treat `useStreamdownWikilinkClick` as conditional

The investigation correctly found fallback AppContext usage in `useStreamdownWikilinkClick` and `open-source-file`.

But Codex found broader call sites:
- `StreamdownIsolated.tsx` imports helpers from `useStreamdownWikilinkClick.ts`.
- Several Quick Search components call `createOpenSourceCallback` without an explicit app instance.

Implementation rule:
- Before changing signatures, run the call graph.
- If all callers can pass a host/app operation safely, remove the fallback.
- If not, skip this subtrack and document the exception.

Do not break Streamdown wikilink click behavior just to gain a small metric delta.

### Correction D: Keep Quick Search relocation optional

Relocating Quick Search port-implementation raw ops into `src/app/quick-search/*` is architecturally nicer, but it is not required for T11N acceptance.

Do it only if:
- Tracks 1-4 are already green;
- the diff remains understandable;
- no new runtime path is introduced.

### Correction E: Regression guard must be precise

Add `test/t11n-ui-vault-port-regression.test.ts`, but make it precise.

It should guard:
- raw UI vault/editor leak floor after T11N;
- `core -> upstream = 0`;
- no new `service -> ui` or `core -> ui`;
- no banned god names;
- no scanner threshold/allowlist changes.

Do not write a broad guard that accidentally allows every raw operation under `src/service/**` and then claims UI is clean. The target is specifically UI raw vault/editor operations and core upstream type imports.

### Correction F: Preserve behavior

Must preserve:
- `URL.createObjectURL` and revoke behavior in hover previews.
- PDF/image/text preview behavior.
- `openLinkText` tab/current-leaf semantics.
- no-editor fallback for wikilink insertion.
- Chat save-to-vault folder creation behavior.
- UsageOutcomeService record behavior and existing error handling in `MessageViewItemRetained`.
- Copilot modal context construction behavior.

## 4. Corrected Impact Contract

Implementation may proceed with this contract:

| Metric | Before | Hard floor after | Stretch |
| --- | ---: | ---: | ---: |
| Raw UI vault/editor leak sites | about 20 | <=10 | <=7 |
| Total flagged | 95 | <=83 | <=75 |
| `UI -> app` | 46 | <=42 | <=38 |
| Direct UI `AppContext` import files | 33 | <=31 | <=29 |
| `core -> upstream` | 2 | 0 | 0 |
| `service -> app` | 7 | <=7 | <=7 |
| `service -> ui` | 0 | 0 | 0 |
| `core -> ui` | 0 | 0 | 0 |
| `service/core -> Obsidian types` | 35 | <=35 | <=34 |

If the implementation cannot hit the raw-op hard floor without risky call-graph changes:
- stop after the safe tracks;
- report the partial result honestly;
- do not label it a major wave.

## 5. Message To Send Back To Claude

```text
Codex reviewed the T11N read-only investigation and approves implementation with corrections.

Proceed with T11N implementation, but apply these constraints:

1. Do not add loose top-level openVaultLink / insertWikilinkAtCursor functions directly to ServiceContext. Use grouped narrow ports instead: vaultPreview, vaultNavigation, editorCommands, chatVaultWriter. Compose adapters in app-owned code (src/app/**, ReactElementFactory, or a composition helper) and inject them into ServiceProvider; ServiceContext should publish injected ports, not become a place that constructs more app adapters.

2. Track 1 approved: add VaultPreviewPort + AppVaultPreviewAdapter for WikilinkHoverPreview and resource-preview-hover. Preserve readText/readBinary/getResourcePath behavior, blob URL lifecycle, PDF/image/text preview behavior.

3. Track 2 approved with shape correction: move BriefingCard, PushCard, view-Messages, and VaultAutoRunModal openLinkText / editor insertion calls to vaultNavigation/editorCommands ports. Preserve tab/current-leaf semantics and no-editor fallback.

4. Track 3 approved: add ChatVaultWriterPort + AppChatVaultWriterAdapter for MessageViewItemRetained save-to-vault. Preserve folder creation, markdown content, UsageOutcomeService.recordVaultSave, and existing error handling.

5. Track 4 approved: replace CopilotPickerModal and CopilotReviewHistoryModal direct app.vault.cachedRead calls with the existing Copilot panel app adapter/composer. Modal classes may call the composer directly; do not use React hooks there.

6. Track 5 conditional: SearchModal may use host.readVaultFileText. For useStreamdownWikilinkClick/open-source-file fallback removal, first inspect all call sites. If every caller can pass host/app safely, remove the fallback; otherwise skip that subtrack and document the exception. Do not break StreamdownIsolated or non-Quick-Search wikilink behavior.

7. Track 6 approved with correction: src/core/types/chat.ts already exists. Do not create it again. Do not blindly move TFile-bearing ChatConversation into pure core/types/chat.ts. Preferred: create an explicit vault-backed type file such as src/core/types/chat-vault.ts, or split the structural conversation fields from the live TFile handle. The acceptance condition is core -> upstream 2 -> 0 without raising service/core -> Obsidian types above 35. Keep service/chat/types.ts as a compatibility re-export if needed.

8. Quick Search port-impl relocation to app/quick-search is optional, not required. Do it only if the main tracks are green and the diff stays understandable.

9. Add test/t11n-ui-vault-port-regression.test.ts. It must guard raw UI vault/editor leak floor, core -> upstream = 0, service -> ui = 0, core -> ui = 0, no banned god names, and no scanner threshold/allowlist changes.

Corrected Impact Contract:
- raw UI vault/editor leak sites: about 20 -> <=10 hard floor, <=7 stretch
- total flagged: 95 -> <=83 hard floor, <=75 stretch
- UI -> app: 46 -> <=42
- direct UI AppContext import files: 33 -> <=31
- core -> upstream: 2 -> 0
- service -> app <=7
- service -> ui = 0
- core -> ui = 0
- service/core -> Obsidian types <=35

Forbidden scope remains: indexService/buildBackboneMap/cascade/indexUpdater, WorkingThemeInferrer/KnowledgeIntuitionAgent/CopilotReviewSession constructor injection, SQLite substrate, provider/model/profile logic, scanner allowlists or boundary-baseline threshold changes.

Verification required:
npm run build
npm run audit:boundary -- --out /tmp/t11n-after.md
npm run test -- test/t11n-ui-vault-port-regression.test.ts
npm run test -- test/t11m-ui-app-boundary-regression.test.ts
npm run test -- test/t11l-remaining-boundary-regression.test.ts test/t11k-obsidian-boundary-regression.test.ts test/t11j-boundary-regression.test.ts test/service-ui-boundary.test.ts

Implementation note must report before/after for total flagged, UI -> app, direct UI AppContext import files, raw UI vault/editor leak sites, core -> upstream, service -> app, service -> ui, core -> ui, and service/core -> Obsidian types. Also list every raw UI vault/editor call site intentionally left behind.
```

