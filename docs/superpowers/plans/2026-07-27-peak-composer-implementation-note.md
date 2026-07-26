# Peak Composer implementation note

Date: 2026-07-27
Baseline: `9f489bb0`
Branch: `codex/composer-closure-evidence`

Status: `PARTIAL`

This note is the closure artifact for the Peak Composer wave at baseline `9f489bb0`.
It is intentionally conservative:
- it does not claim overall `COMPLETE`;
- it distinguishes harness / fixture evidence from real Obsidian evidence;
- anything called out in HANDOFF §7 as degraded or not real-Obsidian-verified is marked `PARTIAL`;
- the final `QA#2` and deletion-gate outcomes are left as placeholders for the primary integrator.

## Inherited verification snapshot

Inherited evidence at `9f489bb0` from HANDOFF §10, not a new run by me:
- `npm run test`: `304 passed / 2 failed (306)` with the two pre-existing failures `chat-studio-message-state-ui` and `code-block-theme-settings`.
- `npm run build`: green.
- `node test/composer-chrome-geometry.qa.mjs`: `49/49`.

That snapshot is the floor for this note. The missing pieces are the real Obsidian `QA#2` matrix and the deletion-gate proof.

## What shipped

The implementation is app-owned and lives in the composer stack, not in a service singleton:
- host / lifecycle: `src/app/composer/DocumentComposerView.ts`, `src/app/composer/DocumentComposerController.ts`, `src/app/composer/DocumentComposerRuntime.ts`, `src/app/composer/composeDocumentComposerRuntime.ts`;
- contracts: `src/core/composer/capabilityContracts.ts`;
- transaction / source / history: `src/service/composer/transactionEngine.ts`, `src/service/composer/sourceRevisionService.ts`, `src/service/composer/historyStore.ts`, `src/service/composer/blockIdentity.ts`;
- capability runtime: `src/service/composer/capabilities/documentRuntime.ts`, `src/app/composer/capabilities/composeComposerCapabilityRuntime.ts`;
- UI shell: `src/ui/view/composer/ComposerRoot.tsx`, `src/ui/view/composer/chrome/EditableText.tsx`, `src/ui/view/composer/chrome/SelectionToolbar.tsx`, `src/ui/view/composer/chrome/UndoRedoBar.tsx`, `src/ui/view/composer/chrome/focusForwarding.ts`;
- sidecar / result browser: `src/ui/view/composer/sidecar/IntelligenceSidecar.tsx`, `src/ui/view/composer/sidecar/ComposerResultBrowserAdapter.ts`.

The concrete runtime flow is:
1. `composeDocumentComposerRuntime()` binds Obsidian adapters and config into `DocumentComposerRuntime`.
2. `DocumentComposerView` creates one controller per view and follows the active file.
3. `DocumentComposerController` loads a `ComposerDocumentSession`, tracks file events, and re-emits stale / loaded states.
4. `DocumentComposerRuntime` composes one `ComposerTransactionHub`, one capability runtime, and one Intelligence runtime per open document.
5. `ComposerRoot` renders the snapshot, wires the chrome, and routes accept / undo / revalidate / sidecar actions through the composed runtime.

## What is not delivered yet

- Real Obsidian `QA#2` is still pending.
- The deletion gate is still pending, so no old-path retirement claim is final.
- The §7 degraded / unverified surfaces remain `PARTIAL`, even where harness tests are green:
  - real bitmap paste;
  - fal.ai edit;
  - KaTeX mathml visual parity;
  - native accept fail-closed under concurrent edits;
  - word-diff readability;
  - Chinese IME full flow;
  - drag gestures;
  - clipboard binary write;
  - mermaid popout;
  - image preview / multi-image UI gaps;
  - native accept not flowing into Markdown History / Undo.

## Old paths deleted

None in this checkpoint.

The branch still needs the deletion-gate pass, so the compatibility paths stay in place for now.

## Dual paths that remain

- `stubComposerCapabilityProjection` in `src/core/composer/capabilityContracts.ts` remains the read-only / not-yet-wired fallback for harness or pre-integration states.
- Markdown history / Undo still differs from native-file accept: Markdown uses `ComposerTransactionHub` + `ComposerHistoryStore`, while native object accept goes through `ObsidianNativeFileAdapter` / the native-file port.
- Quick Search and Composer still share a controlled Result Browser, but each host owns its own adapter layer.
- `ComposerRoot` still accepts both static props and reactive `runtimeSource` / `intelligenceSource` so a session switch can rebind without remounting the document.

## How to add a new Composer AI capability

1. Add a capability definition pack under `src/service/composer/capabilities/packs/` and register it in `composeComposerCapabilityRuntime.ts`.
2. Give it a stable `manifest.id`, `configKey`, `PromptId`, `rendererId`, `resultKind`, and, if it mutates source, a `writebackAdapterId`.
3. Add the prompt/config strings to `templates/config/composer.json` and the fallback config path that mirrors it.
4. Add a result materializer in `src/service/composer/capabilities/resultMaterializers.ts` and the matching writeback adapter in `src/service/composer/capabilities/writebackAdapters.ts`.
5. Keep the runtime frozen: the chrome only sees `ComposerCapabilityProjectionPort`, and invocation always uses the frozen `ComposerContextSnapshot`.
6. Register the pack in `ComposerCapabilityRegistry`, then let `validateBindings()` prove every result kind and adapter resolve.
7. If the capability targets a separate native object file, thread `nativeFilePort` through the app composition path and keep accept fail-closed.

Concrete files to touch:
- `src/app/composer/capabilities/composeComposerCapabilityRuntime.ts`
- `src/service/composer/capabilities/registry.ts`
- `src/service/composer/capabilities/documentRuntime.ts`
- `src/service/composer/capabilities/resultMaterializers.ts`
- `src/service/composer/capabilities/writebackAdapters.ts`
- `templates/config/composer.json`
- `src/core/composer/capabilityContracts.ts`

## How to debug source mapping, transaction, writeback, and History

Use this chain in order:
1. `src/service/composer/sourceRevisionService.ts`
   - `computeRevision()` and `revalidateAnchor()` tell you whether the live bytes still match the frozen snapshot.
2. `src/service/composer/transactionEngine.ts`
   - step 1: revalidate the live source against the session snapshot;
   - step 2: apply operations atomically;
   - step 3: reparse and assert the target semantic still exists;
   - step 4: write through the revision-guarded port.
3. `src/service/composer/blockIdentity.ts`
   - `matchBlocks()` remaps surviving blocks across a reparse.
4. `src/service/composer/historyStore.ts`
   - direct bursts and AI runs are grouped by `groupId` / `runId`;
   - rollback appends a new inverse entry instead of deleting the original.
5. `src/app/composer/DocumentComposerController.ts`
   - `onHubMutation()` reparses the snapshot, revalidates comments, and re-anchors findings.
6. `src/service/composer/capabilities/documentRuntime.ts`
   - `invoke()` freezes the snapshot and `accept()` routes native-file patches separately from Markdown writes.

When a write fails, the reason string tells you where to look:
- `revision-mismatch` means the live bytes drifted before commit;
- `target-missing-after-reparse` means the splice fused or lost structure;
- `stale-candidate` means the candidate needs a fresh run on the current revision.

## How to reproduce object QA

Use the contract-focused tests, not only the full suite:
- `npm run test -- test/composer-frontmatter.test.ts`
- `npm run test -- test/composer-formula-details.test.ts`
- `npm run test -- test/composer-table-selection.test.ts`
- `npm run test -- test/composer-table-merge-html.test.ts`
- `npm run test -- test/composer-image-asset-transaction.test.ts`
- `npm run test -- test/composer-image-layout.test.ts`
- `npm run test -- test/composer-image-integration.test.ts`
- `npm run test -- test/composer-native-roundtrip.test.ts`
- `npm run test -- test/composer-native-runtime.test.ts`
- `npm run test -- test/composer-finding-identity.test.ts`
- `npm run test -- test/composer-intelligence-session.test.ts`
- `npm run test -- test/result-browser-contract.test.ts`
- `npm run test -- test/result-browser-host-parity.test.ts`
- `node test/composer-chrome-geometry.qa.mjs`

Evidence types:
- `test/composer-chrome-geometry.qa.mjs` is headless browser geometry evidence.
- The `QA#1` items in HANDOFF are real Obsidian evidence.
- The `304/306` / `49/49` snapshot above is inherited evidence from HANDOFF, not a new run by me.

## Where the owner should open next

Open a real Markdown note with `Open document in Peak Composer` / `peak-open-document-composer`.

The concrete entry points are:
- `src/app/commands/gateway/manifests.ts`
- `src/app/commands/gateway/composeCommandGatewayBindings.ts`
- `src/app/commands/PeakCommandActions.ts`
- `src/app/ui-host/views/ViewManager.ts`
- `src/app/composer/DocumentComposerView.ts`

## Traceability matrix

Legend:
- `COMPLETE` = production implementation exists, automated evidence exists, and the item is not called out in HANDOFF §7 as degraded / unverified.
- `PARTIAL` = implementation exists, but the evidence is still only harness / fixture / headless, or the item is explicitly listed in HANDOFF §7.
- `BLOCKED` and `NOT-APPLICABLE` are not used in this checkpoint.

| ID | production files | automated tests | QA evidence | status |
| --- | --- | --- | --- | --- |
| CMP-HOST-01 | `src/app/composer/DocumentComposerView.ts`; `src/app/composer/DocumentComposerController.ts`; `src/app/composer/DocumentComposerRuntime.ts`; `src/app/composer/composeDocumentComposerRuntime.ts` | `test/composer-view-lifecycle.test.ts`; `test/composer-source-roundtrip.test.ts`; `test/composer-source-stale-revalidation.test.ts`; `test/composer-block-identity.test.ts` | QA#1 real Obsidian active-file open/switch/rename/delete/external edit; inherited baseline 304/306, build green, geometry 49/49 | COMPLETE |
| CMP-HOST-02 | `src/app/composer/DocumentComposerView.ts`; `src/app/composer/DocumentComposerController.ts`; `src/service/composer/documentSession.ts`; `src/service/composer/sourceRevisionService.ts` | `test/composer-view-lifecycle.test.ts`; `test/composer-source-stale-revalidation.test.ts`; `test/composer-transaction-atomicity.test.ts` | QA#1 real Obsidian lifecycle and stale detection smoke | COMPLETE |
| CMP-HOST-03 | `src/service/composer/documentParser.ts`; `src/service/composer/blockIdentity.ts`; `src/service/composer/sourceRevisionService.ts` | `test/composer-source-roundtrip.test.ts`; `test/composer-block-identity.test.ts`; `test/composer-source-stale-revalidation.test.ts` | Automated lossless round-trip over golden fixtures; no §7 gap beyond harness-only validation | COMPLETE |
| CMP-HOST-04 | `src/service/composer/blockIdentity.ts`; `src/service/composer/sourceRevisionService.ts`; `src/service/composer/documentSession.ts` | `test/composer-block-identity.test.ts`; `test/composer-source-stale-revalidation.test.ts` | Automated block rematch / fingerprint / revision checks | COMPLETE |
| CMP-HOST-05 | `src/ui/view/composer/ComposerRoot.tsx`; `src/ui/view/composer/chrome/EditableText.tsx`; `src/ui/view/composer/chrome/focusForwarding.ts`; `src/service/composer/transactionEngine.ts` | `test/composer-chrome-geometry.qa.mjs`; `test/composer-focus-forwarding.test.ts`; `test/composer-transaction-atomicity.test.ts` | Headless continuity checks exist, but drag gestures are explicitly unverified in HANDOFF §7 | PARTIAL |
| CMP-HOST-06 | `src/app/composer/DocumentComposerView.ts`; `src/app/composer/DocumentComposerController.ts`; `src/ui/view/composer/ComposerRoot.tsx` | `test/composer-view-lifecycle.test.ts`; `test/composer-source-roundtrip.test.ts` | QA#1 confirms Document Composer stays separate from the Chat Composer path | COMPLETE |
| CMP-UI-01 | `src/ui/view/composer/ComposerRoot.tsx`; `src/ui/view/composer/chrome/BlockRail.tsx`; `src/ui/view/composer/chrome/BlockActionRow.tsx`; `src/ui/view/composer/chrome/DisplayStateSwitch.tsx` | `test/composer-chrome-geometry.qa.mjs`; `test/composer-focus-forwarding.test.ts` | Headless geometry only; rail drag is part of the §7 drag-gate gap | PARTIAL |
| CMP-UI-02 | `src/ui/view/composer/ComposerRoot.tsx`; `src/ui/view/composer/chrome/BlockActionRow.tsx`; `src/ui/view/composer/chrome/SelectionToolbar.tsx` | `test/composer-chrome-geometry.qa.mjs`; `test/composer-selection-partition.test.ts`; `test/composer-table-selection.test.ts` | QA#1 sees the flattened action row with the expected real UI; no second-level AI opener in harness | COMPLETE |
| CMP-UI-03 | `src/ui/view/composer/ComposerRoot.tsx`; `src/ui/view/composer/chrome/BlockRail.tsx`; `src/ui/view/composer/chrome/UndoRedoBar.tsx`; `src/ui/view/composer/chrome/SelectionToolbar.tsx` | `test/composer-chrome-geometry.qa.mjs`; `test/composer-result-renderer.test.ts` | Headless geometry locks the token / radius family; no §7 gap called out here | COMPLETE |
| CMP-UI-04 | `src/ui/view/composer/ComposerRoot.tsx`; `src/ui/view/composer/chrome/BlockActionRow.tsx`; `src/ui/view/composer/chrome/UndoRedoBar.tsx` | `test/composer-chrome-geometry.qa.mjs` | Geometry QA proves stable padding/alignment with no layout shift in the harness | COMPLETE |
| CMP-UI-05 | `src/ui/view/composer/chrome/UndoRedoBar.tsx`; `src/ui/view/composer/ComposerRoot.tsx` | `test/composer-chrome-geometry.qa.mjs`; `test/composer-undo-redo.test.ts` | QA#1 undo/redo bar works and keeps its slot | COMPLETE |
| CMP-SEL-01 | `src/service/composer/selection/markSerializer.ts`; `src/ui/view/composer/chrome/EditableText.tsx`; `src/ui/view/composer/chrome/SelectionToolbar.tsx` | `test/composer-selection-partition.test.ts`; `test/composer-easy-copy.test.ts` | QA#1 selection toolbar and direct-edit smoke; Chinese IME full flow remains §7 partial | PARTIAL |
| CMP-SEL-02 | `src/service/composer/selection/partitionSelection.ts`; `src/service/composer/selection/markSerializer.ts`; `src/ui/view/composer/chrome/SelectionToolbar.tsx` | `test/composer-selection-partition.test.ts`; `test/composer-easy-copy.test.ts`; `test/composer-paste-image.test.ts` | QA#1 selection toolbar visible and actionable | COMPLETE |
| CMP-SEL-03 | `src/service/composer/selection/partitionSelection.ts`; `src/service/composer/selection/linkOps.ts`; `src/ui/view/composer/chrome/SelectionToolbar.tsx` | `test/composer-selection-partition.test.ts`; `test/composer-table-selection.test.ts` | Headless partition coverage exists, but drag gestures and table-cell semantics are still §7 partial | PARTIAL |
| CMP-SEL-04 | `src/service/composer/selection/markSerializer.ts`; `src/ui/view/composer/chrome/SelectionToolbar.tsx` | `test/composer-selection-partition.test.ts` | Automated code-block rich-format suppression is covered | COMPLETE |
| CMP-SEL-05 | `src/service/composer/selection/linkOps.ts`; `src/ui/view/composer/chrome/SelectionToolbar.tsx`; `src/ui/view/composer/chrome/EditableText.tsx` | `test/composer-selection-partition.test.ts`; `test/composer-easy-copy.test.ts` | URL paste guard exists; clipboard binary write is the separate §7 partial item | COMPLETE |
| CMP-COPY-01 | `src/service/composer/clipboard/easyCopy.ts`; `src/ui/view/composer/chrome/EasyCopyMenu.tsx` | `test/composer-easy-copy.test.ts` | Headless copy-order and payload assertions | COMPLETE |
| CMP-COPY-02 | `src/service/composer/clipboard/easyCopy.ts`; `src/ui/view/composer/chrome/EasyCopyMenu.tsx`; `src/ui/view/composer/chrome/rasterize.ts` | `test/composer-easy-copy.test.ts`; `test/composer-chrome-geometry.qa.mjs` | Automated exact rendered-image path exists; real-device clipboard/image write is still separate | COMPLETE |
| CMP-COPY-03 | `src/service/composer/clipboard/easyCopy.ts`; `src/ui/view/composer/chrome/EasyCopyMenu.tsx` | `test/composer-easy-copy.test.ts` | Plain-text newline / indentation preservation is fully automated | COMPLETE |
| CMP-LINK-01 | `src/service/composer/selection/linkOps.ts`; `src/service/composer/linkPreview/linkPreviewModel.ts`; `src/ui/view/composer/chrome/LinkPreviewLayer.tsx` | `test/composer-source-roundtrip.test.ts`; `test/composer-selection-partition.test.ts`; `test/composer-writeback-adapters.test.ts` | QA#1 link hover/open smoke | COMPLETE |
| CMP-COMMENT-01 | `src/service/composer/comment/commentStore.ts`; `src/service/composer/comment/commentModel.ts`; `src/ui/view/composer/chrome/CommentPanel.tsx`; `src/app/composer/ObsidianComposerAdapters.ts` | `test/composer-comment-anchor.test.ts`; `test/composer-view-lifecycle.test.ts` | QA#1 comment anchor + persistence smoke | COMPLETE |
| CMP-FM-01 | `src/service/composer/packs/frontmatter/yamlModel.ts`; `src/service/composer/packs/frontmatter/yamlWriteback.ts`; `src/ui/view/composer/blocks/frontmatter/FrontmatterBlockView.tsx` | `test/composer-frontmatter.test.ts`; `test/composer-capability-applicability.test.ts`; `test/composer-writeback-adapters.test.ts` | Headless frontmatter model / writeback coverage | COMPLETE |
| CMP-FM-02 | `src/service/composer/packs/frontmatter/vaultInventory.ts`; `src/ui/view/composer/blocks/frontmatter/FrontmatterBlockView.tsx` | `test/composer-frontmatter.test.ts`; `test/composer-capability-registry.test.ts` | Fixture and inventory tests only | COMPLETE |
| CMP-FM-03 | `src/service/composer/packs/frontmatter/vaultInventory.ts`; `src/service/composer/packs/frontmatter/yamlModel.ts` | `test/composer-frontmatter.test.ts` | Automated field-frequency / rarity / conflict stats | COMPLETE |
| CMP-FM-04 | `src/service/composer/packs/frontmatter/vaultInventory.ts`; `src/ui/view/composer/blocks/frontmatter/AddFrontmatterEntry.tsx`; `src/ui/view/composer/blocks/frontmatter/MetadataSuggestionCandidateCard.tsx` | `test/composer-frontmatter.test.ts`; `test/composer-capability-applicability.test.ts` | Automated field-candidate coverage exists | COMPLETE |
| CMP-FM-05 | `src/service/composer/packs/frontmatter/yamlWriteback.ts`; `src/ui/view/composer/blocks/frontmatter/MetadataSuggestionCandidateCard.tsx` | `test/composer-frontmatter.test.ts`; `test/composer-writeback-adapters.test.ts` | AI suggestion / no auto-YAML-write contract covered by tests | COMPLETE |
| CMP-TXN-01 | `src/service/composer/transactionEngine.ts`; `src/service/composer/transactionHub.ts`; `src/service/composer/historyStore.ts` | `test/composer-transaction-atomicity.test.ts`; `test/composer-undo-redo.test.ts` | QA#1 accept/undo/redo smoke; inherited baseline 304/306, build green, geometry 49/49 | COMPLETE |
| CMP-TXN-02 | `src/service/composer/transactionEngine.ts`; `src/service/composer/historyStore.ts`; `src/service/composer/undoRedoStore.ts` | `test/composer-transaction-atomicity.test.ts`; `test/composer-candidate-variants.test.ts` | Pending candidates do not hit Markdown source or History | COMPLETE |
| CMP-TXN-03 | `src/service/composer/sourceRevisionService.ts`; `src/service/composer/transactionEngine.ts`; `src/service/composer/transactionHub.ts` | `test/composer-source-stale-revalidation.test.ts`; `test/composer-transaction-atomicity.test.ts` | Automated stale / revision-mismatch rejection | COMPLETE |
| CMP-TXN-04 | `src/service/composer/transactionEngine.ts`; `src/service/composer/historyStore.ts`; `src/service/composer/undoRedoStore.ts` | `test/composer-history-grouping.test.ts`; `test/composer-undo-redo.test.ts` | Rollback origins and undo state are fully tested | COMPLETE |
| CMP-REV-01 | `src/service/composer/blockIdentity.ts`; `src/service/composer/sourceRevisionService.ts` | `test/composer-source-roundtrip.test.ts`; `test/composer-block-identity.test.ts`; `test/composer-source-stale-revalidation.test.ts` | Automated clean / work / all-changes projections | COMPLETE |
| CMP-REV-02 | `src/service/composer/render/wordDiff.ts`; `src/ui/view/composer/candidates/StreamingTextCandidateCard.tsx`; `src/ui/view/composer/chrome/TransactionNotice.tsx` | `test/composer-word-diff.test.ts`; `test/composer-typed-object-runtime.test.ts` | Word-diff logic is automated, but readability in real Obsidian is still §7 partial | PARTIAL |
| CMP-REV-03 | `src/service/composer/blockIdentity.ts`; `src/ui/view/composer/ComposerRoot.tsx`; `src/ui/view/composer/candidates/ComposerCandidateHost.tsx` | `test/composer-block-identity.test.ts`; `test/composer-candidate-variants.test.ts` | Structural source / candidate target are both present exactly once | COMPLETE |
| CMP-REV-04 | `src/ui/view/composer/ComposerRoot.tsx`; `src/ui/view/composer/candidates/ComposerCandidateHost.tsx` | `test/composer-candidate-variants.test.ts`; `test/composer-writeback-adapters.test.ts` | Additive draft insertion is covered by automation | COMPLETE |
| CMP-REV-05 | `src/service/composer/packs/table/tableModel.ts`; `src/service/composer/packs/frontmatter/yamlModel.ts`; `src/service/composer/packs/native/nativeFilePatch.ts`; `src/service/composer/packs/image/imageMaterializers.ts` | `test/composer-table-merge-html.test.ts`; `test/composer-frontmatter.test.ts`; `test/composer-native-roundtrip.test.ts`; `test/composer-image-asset-transaction.test.ts` | Object-native review exists, but native/image real-device gaps keep this partial | PARTIAL |
| CMP-AI-01 | `src/service/composer/capabilities/documentRuntime.ts`; `src/app/composer/capabilities/composeComposerCapabilityRuntime.ts`; `src/service/composer/capabilities/resultMaterializers.ts` | `test/composer-typed-object-runtime.test.ts`; `test/composer-candidate-variants.test.ts` | Harness covers text / structured / image streaming; Table AI real-provider JSON is still §7 partial | PARTIAL |
| CMP-AI-02 | `src/service/composer/capabilities/documentRuntime.ts`; `src/core/composer/capabilityContracts.ts` | `test/composer-capability-applicability.test.ts`; `test/composer-typed-object-runtime.test.ts` | Targeted instruction is frozen into run context and tested | COMPLETE |
| CMP-AI-03 | `src/service/composer/capabilities/documentRuntime.ts`; `src/service/composer/historyStore.ts` | `test/composer-candidate-variants.test.ts`; `test/composer-history-grouping.test.ts` | Append-only variants and 2+ navigation are automated | COMPLETE |
| CMP-AI-04 | `src/service/composer/capabilities/documentRuntime.ts`; `src/service/composer/transactionHub.ts` | `test/composer-candidate-variants.test.ts`; `test/composer-writeback-adapters.test.ts` | Accepting the active completed variant is fully covered | COMPLETE |
| CMP-AI-05 | `src/service/composer/capabilities/documentRuntime.ts`; `src/service/composer/capabilities/registry.ts`; `src/core/composer/capabilityContracts.ts` | `test/composer-capability-registry.test.ts`; `test/composer-result-renderer.test.ts`; `test/composer-typed-object-runtime.test.ts` | Single app-owned runtime, stable IDs, typed results all exist | COMPLETE |
| CMP-AI-06 | `src/service/composer/capabilities/registry.ts`; `src/service/composer/capabilities/resultMaterializers.ts`; `src/service/composer/capabilities/writebackAdapters.ts` | `test/composer-result-renderer.test.ts`; `test/composer-writeback-adapters.test.ts` | Renderer / writeback registries and no label dispatch are automated | COMPLETE |
| CMP-AI-07 | `src/app/composer/capabilities/composeComposerCapabilityRuntime.ts`; `templates/config/composer.json`; `src/service/composer/capabilities/registry.ts` | `test/composer-capability-registry.test.ts`; `test/composer-config.test.ts` | Prompt / config governance and fake-port tests are in place | COMPLETE |
| CMP-AI-08 | `src/app/composer/capabilities/composeComposerCapabilityRuntime.ts`; `src/service/composer/capabilities/documentRuntime.ts`; `src/ui/view/composer/ComposerRoot.tsx` | `test/composer-capability-registry.test.ts`; `test/composer-capability-applicability.test.ts`; `test/composer-result-renderer.test.ts` | Current production Copilot action parity is covered in automation | COMPLETE |
| CMP-AI-09 | `src/app/composer/capabilities/composeComposerCapabilityRuntime.ts`; `src/service/composer/capabilities/registry.ts`; `src/ui/view/composer/ComposerRoot.tsx` | `test/composer-capability-registry.test.ts`; `test/composer-result-renderer.test.ts` | Current Composer global projection registry is in place | COMPLETE |
| CMP-HIST-01 | `src/service/composer/historyStore.ts`; `src/service/composer/transactionHub.ts` | `test/composer-history-grouping.test.ts`; `test/composer-transaction-atomicity.test.ts` | QA#1 history locate / rollback smoke | COMPLETE |
| CMP-HIST-02 | `src/service/composer/historyStore.ts`; `src/service/composer/transactionHub.ts` | `test/composer-history-grouping.test.ts`; `test/composer-undo-redo.test.ts` | Automated child grouping / locateability is covered | COMPLETE |
| CMP-HIST-03 | `src/service/composer/historyStore.ts`; `src/service/composer/transactionHub.ts`; `src/service/composer/undoRedoStore.ts` | `test/composer-history-grouping.test.ts`; `test/composer-undo-redo.test.ts` | Rollback appends inverse history records and is test-covered | COMPLETE |
| CMP-UNDO-01 | `src/service/composer/undoRedoStore.ts`; `src/service/composer/transactionHub.ts` | `test/composer-undo-redo.test.ts`; `test/composer-history-grouping.test.ts` | QA#1 undo/redo smoke | COMPLETE |
| CMP-UNDO-02 | `src/service/composer/undoRedoStore.ts`; `src/service/composer/transactionHub.ts` | `test/composer-undo-redo.test.ts` | New commit after undo clears redo; automated | COMPLETE |
| CMP-MATH-01 | `src/service/composer/packs/math/formulaModel.ts`; `src/ui/view/composer/blocks/math/MathBlockView.tsx` | `test/composer-formula-details.test.ts` | Formula parsing / detail grouping is automated | COMPLETE |
| CMP-MATH-02 | `src/service/composer/packs/math/formulaDetailModel.ts`; `src/service/composer/packs/math/formulaCopy.ts` | `test/composer-formula-details.test.ts` | Cross-formula coexistence is covered by tests | COMPLETE |
| CMP-MATH-03 | `src/service/composer/packs/math/formulaMaterializer.ts`; `src/ui/view/composer/blocks/math/FormulaDetailPanel.tsx` | `test/composer-formula-details.test.ts` | Follow-up / variant flow is automated | COMPLETE |
| CMP-MATH-04 | `src/service/composer/packs/math/formulaDetailModel.ts`; `src/ui/view/composer/blocks/math/FormulaDetailPanel.tsx` | `test/composer-formula-details.test.ts` | Clicked-formula-only variable tables are covered | COMPLETE |
| CMP-MATH-05 | `src/service/composer/packs/math/formulaCopy.ts`; `src/ui/view/composer/blocks/math/KatexFormula.tsx` | `test/composer-formula-details.test.ts`; `test/composer-easy-copy.test.ts` | Headless copy is covered; KaTeX mathml visual parity is still §7 partial | PARTIAL |
| CMP-TABLE-01 | `src/service/composer/packs/table/tableSelection.ts`; `src/ui/view/composer/blocks/table/useTableObjectSelection.ts`; `src/ui/view/composer/blocks/table/TableBlockView.tsx` | `test/composer-table-selection.test.ts`; `test/composer-table-merge-html.test.ts` | Table selection is automated, but drag gestures remain §7 partial | PARTIAL |
| CMP-TABLE-02 | `src/service/composer/packs/table/tableSelection.ts`; `src/ui/view/composer/blocks/table/useTableObjectSelection.ts` | `test/composer-table-selection.test.ts` | Rectangle / discontinuous selection logic is automated | PARTIAL |
| CMP-TABLE-03 | `src/service/composer/packs/table/tableBlockOps.ts`; `src/ui/view/composer/blocks/table/TableToolbar.tsx` | `test/composer-table-selection.test.ts`; `test/composer-table-merge-html.test.ts` | Overlay / ARIA / keyboard coverage exists, but real drag semantics are still partial | PARTIAL |
| CMP-TABLE-04 | `src/service/composer/packs/table/tableModel.ts`; `src/service/composer/packs/table/htmlPort.ts` | `test/composer-table-merge-html.test.ts` | Merge / unmerge / valid-rectangle logic is automated | PARTIAL |
| CMP-TABLE-05 | `src/service/composer/packs/table/htmlPort.ts`; `src/service/composer/packs/table/tableModel.ts` | `test/composer-table-merge-html.test.ts` | Pipe Markdown plain-grid and HTML upgrade coverage is green | COMPLETE |
| CMP-TABLE-06 | `src/service/composer/packs/table/tableBlockOps.ts`; `src/service/composer/packs/table/tableModel.ts` | `test/composer-table-merge-html.test.ts` | Deterministic add/remove/sort/transpose/CSV actions are covered | COMPLETE |
| CMP-TABLE-07 | `src/service/composer/packs/table/tableSelection.ts`; `src/service/composer/capabilities/documentRuntime.ts` | `test/composer-typed-object-runtime.test.ts`; `test/composer-table-merge-html.test.ts` | Typed AI table patches exist, but the real-provider JSON path is still §7 partial | PARTIAL |
| CMP-CHART-01 | `src/service/composer/packs/chart/chartModel.ts`; `src/ui/view/composer/blocks/chart/ChartBlockView.tsx` | `test/composer-chart.test.ts`; `test/composer-typed-object-runtime.test.ts` | Chart block creation and source generation are automated | COMPLETE |
| CMP-CHART-02 | `src/service/composer/packs/chart/chartModel.ts`; `src/ui/view/composer/blocks/chart/RechartsChart.tsx` | `test/composer-chart.test.ts`; `test/composer-typed-object-runtime.test.ts` | Bar / line / pie switching is covered in headless tests | COMPLETE |
| CMP-IMG-01 | `src/service/composer/packs/image/imageTransaction.ts`; `src/app/composer/ObsidianComposerImageAdapters.ts`; `src/ui/view/composer/chrome/pasteImage.ts` | `test/composer-image-asset-transaction.test.ts`; `test/composer-paste-image.test.ts` | Harness / fixture only; real bitmap paste and clipboard binary write stay §7 partial | PARTIAL |
| CMP-IMG-02 | `src/service/composer/packs/image/imageNaming.ts`; `src/service/composer/packs/image/imageTransaction.ts`; `src/ui/view/composer/blocks/image/ImageAssetCandidateCard.tsx` | `test/composer-image-asset-transaction.test.ts` | Automated semantic rename / history tracking exists, but real-device image flows are partial | PARTIAL |
| CMP-IMG-03 | `src/service/composer/packs/image/imageCanvas.ts`; `src/service/composer/packs/image/imageLayout.ts`; `src/ui/view/composer/blocks/image/ImageReviewControls.tsx` | `test/composer-image-asset-transaction.test.ts`; `test/composer-image-layout.test.ts` | Direct crop / rotate / straighten / flip are harness-tested only | PARTIAL |
| CMP-IMG-04 | `src/service/composer/packs/image/imageCanvas.ts`; `src/service/composer/packs/image/imageMaterializers.ts`; `src/ui/view/composer/blocks/image/ImageReviewControls.tsx` | `test/composer-image-asset-transaction.test.ts`; `test/composer-image-layout.test.ts` | Compression / format / metadata preview exists, but previewUri / binary paths remain partial | PARTIAL |
| CMP-IMG-05 | `src/service/composer/packs/image/imageCaption.ts`; `src/ui/view/composer/blocks/image/ImageBlockView.tsx` | `test/composer-image-asset-transaction.test.ts`; `test/composer-image-layout.test.ts` | Figcaption-in-figure is automated; gallery/verbatim layout still has §7 gaps | PARTIAL |
| CMP-IMG-06 | `src/service/composer/packs/image/imageCoordinator.ts`; `src/service/composer/packs/image/imageWritebackAdapters.ts`; `src/ui/view/composer/blocks/image/ImageAnnotationCandidateCard.tsx` | `test/composer-image-asset-transaction.test.ts`; `test/composer-image-integration.test.ts` | fal.ai edit is still a real-device gap, so this remains partial | PARTIAL |
| CMP-IMG-07 | `src/service/composer/packs/image/imageMaterializers.ts`; `src/ui/view/composer/blocks/image/ImageLayoutCandidateCard.tsx` | `test/composer-image-layout.test.ts`; `test/composer-image-integration.test.ts` | Skeleton / accept-one-version flow is automated only | PARTIAL |
| CMP-IMG-08 | `src/service/composer/packs/image/imageLayout.ts`; `src/ui/view/composer/blocks/image/ImageLayoutCandidateCard.tsx` | `test/composer-image-layout.test.ts`; `test/composer-image-integration.test.ts` | Markdown-visible multi-image layouts are headless-tested; UI entry / real fit remain partial | PARTIAL |
| CMP-NATIVE-01 | `src/service/composer/packs/native/codeBlock.ts`; `src/service/composer/packs/native/baseFile.ts`; `src/ui/view/composer/blocks/code/CodeBlockView.tsx` | `test/composer-native-roundtrip.test.ts`; `test/composer-native-contracts.test.ts` | Semantic-only editing and exact source-copy are automated | COMPLETE |
| CMP-NATIVE-02 | `src/service/composer/packs/native/mermaid.ts`; `src/ui/view/composer/blocks/mermaid/MermaidBlockView.tsx` | `test/composer-native-runtime.test.ts`; `test/composer-native-contracts.test.ts` | Mermaid contract is automated, but mermaid popout is still §7 partial | PARTIAL |
| CMP-NATIVE-03 | `src/service/composer/packs/native/baseFile.ts`; `src/app/composer/ObsidianNativeFileAdapter.ts` | `test/composer-native-roundtrip.test.ts`; `test/composer-native-runtime.test.ts` | Base candidate / source / preview handling is automated, but native accept fail-closed and no-Markdown-History remain §7 partial | PARTIAL |
| CMP-NATIVE-04 | `src/service/composer/packs/native/canvasFile.ts`; `src/ui/view/composer/blocks/canvas/CanvasBlockView.tsx` | `test/composer-native-roundtrip.test.ts`; `test/composer-native-runtime.test.ts` | Typed Canvas node / edge patching is automated | COMPLETE |
| CMP-NATIVE-05 | `src/service/composer/packs/native/excalidrawFile.ts`; `src/ui/view/composer/blocks/excalidraw/ExcalidrawBlockView.tsx` | `test/composer-native-roundtrip.test.ts`; `test/composer-native-runtime.test.ts` | Typed Excalidraw patching is automated | COMPLETE |
| CMP-NATIVE-06 | `src/service/composer/packs/native/nativeFilePatch.ts`; `src/ui/view/composer/blocks/embed/EmbedBlockView.tsx`; `src/ui/view/composer/blocks/nativeBlockShared.tsx` | `test/composer-native-contracts.test.ts`; `test/composer-native-runtime.test.ts` | Typed embed / attachment / citation / link actions are automated | COMPLETE |
| CMP-FIND-01 | `src/service/composer/intelligence/findingIdentity.ts`; `src/service/composer/intelligence/IntelligenceRuntime.ts` | `test/composer-finding-identity.test.ts`; `test/composer-intelligence-session.test.ts` | Headless dedup / fingerprint / evidence-revision coverage | COMPLETE |
| CMP-FIND-02 | `src/service/composer/intelligence/findingIdentity.ts`; `src/service/composer/intelligence/IntelligenceRuntime.ts`; `src/ui/view/composer/sidecar/CopilotView.tsx` | `test/composer-finding-identity.test.ts`; `test/composer-intelligence-session.test.ts` | Cross-surface consume / dismiss / stale re-anchor is automated | COMPLETE |
| CMP-SIDE-01 | `src/service/composer/intelligence/runSession.ts`; `src/ui/view/composer/sidecar/IntelligenceSidecar.tsx`; `src/ui/view/composer/sidecar/CopilotView.tsx` | `test/composer-intelligence-session.test.ts`; `test/composer-finding-identity.test.ts` | QA#1 sidecar smoke; top-level only Copilot / History is encoded | COMPLETE |
| CMP-SIDE-02 | `src/service/composer/intelligence/runSession.ts`; `src/ui/view/composer/sidecar/IntelligenceSidecar.tsx`; `src/ui/view/composer/sidecar/HistoryView.tsx` | `test/composer-intelligence-session.test.ts` | Brief / session / running / review lifecycle is automated | COMPLETE |
| CMP-SIDE-03 | `src/service/composer/intelligence/runSession.ts`; `src/service/composer/intelligence/relatedMaterials.ts`; `src/ui/view/composer/sidecar/focusContext.ts` | `test/composer-intelligence-session.test.ts`; `test/composer-related-materials.test.ts` | Live vs frozen run context is covered by automation | COMPLETE |
| CMP-SIDE-04 | `src/service/composer/intelligence/telemetry.ts`; `src/ui/view/composer/sidecar/RunReceiptCard.tsx` | `test/composer-intelligence-session.test.ts` | Receipt counts / privacy-safe telemetry are automated | COMPLETE |
| CMP-SIDE-05 | `src/service/composer/intelligence/IntelligenceRuntime.ts`; `src/ui/view/composer/sidecar/IntelligenceSidecar.tsx`; `src/ui/view/composer/sidecar/HistoryView.tsx` | `test/composer-intelligence-session.test.ts`; `test/result-browser-host-parity.test.ts` | Document-owned review and locate/explain/status are automated | COMPLETE |
| CMP-REL-01 | `src/service/composer/intelligence/relatedMaterials.ts`; `src/ui/view/composer/sidecar/ComposerResultBrowserAdapter.ts`; `src/ui/view/composer/sidecar/RelatedMaterialsModal.tsx` | `test/composer-related-materials.test.ts`; `test/result-browser-contract.test.ts`; `test/result-browser-host-parity.test.ts` | Bounded local preview is automated | COMPLETE |
| CMP-REL-02 | `src/ui/view/composer/sidecar/RelatedMaterialsModal.tsx`; `src/ui/view/composer/sidecar/ComposerResultBrowserAdapter.ts`; `src/app/search/composeQuickSearchHost.ts` | `test/result-browser-contract.test.ts`; `test/result-browser-host-parity.test.ts` | The wide modal exists, but real graph fit is still §7 partial | PARTIAL |
| CMP-RB-01 | `src/ui/view/composer/sidecar/ComposerResultBrowserAdapter.ts`; `src/app/search/composeQuickSearchHost.ts`; `src/app/search/background/composeQuickSearchBackgroundRuntime.ts` | `test/result-browser-contract.test.ts`; `test/result-browser-host-parity.test.ts` | Controlled shared Result Browser is fully automated | COMPLETE |
| CMP-RB-02 | `src/ui/view/composer/sidecar/ComposerResultBrowserAdapter.ts`; `src/app/search/composeQuickSearchHost.ts` | `test/result-browser-contract.test.ts`; `test/result-browser-host-parity.test.ts` | List / Tree / Graph invariants are covered | COMPLETE |
| CMP-RB-03 | `src/ui/view/composer/sidecar/ComposerResultBrowserAdapter.ts`; `src/app/search/composeQuickSearchHost.ts`; `src/app/search/background/composeQuickSearchBackgroundRuntime.ts` | `test/result-browser-contract.test.ts`; `test/result-browser-host-parity.test.ts` | Quick Search and Composer host adapters are covered | COMPLETE |
| CMP-RB-04 | `src/ui/view/composer/sidecar/ComposerResultBrowserAdapter.ts`; `src/app/search/composeQuickSearchHost.ts` | `test/result-browser-contract.test.ts`; `test/result-browser-host-parity.test.ts` | Projection changes do not search or rebuild | COMPLETE |
| CMP-METRIC-01 | `src/service/composer/intelligence/telemetry.ts`; `src/ui/view/composer/sidecar/sidecarConfig.ts` | `test/composer-intelligence-session.test.ts` | Relevance / outcome / control / interruption metrics are automated | COMPLETE |
| CMP-METRIC-02 | `src/service/composer/intelligence/telemetry.ts`; `src/app/composer/ObsidianComposerAdapters.ts` | `test/composer-intelligence-session.test.ts` | Dedup / reliability / performance / trust / learning metrics are automated | COMPLETE |
| CMP-METRIC-03 | `src/service/composer/intelligence/telemetry.ts`; `src/ui/view/composer/sidecar/sidecarConfig.ts` | `test/composer-intelligence-session.test.ts` | Privacy-safe telemetry and exposure-normalized evaluation are automated | COMPLETE |
| CMP-RESP-01 | `src/ui/view/composer/ComposerRoot.tsx`; `src/ui/view/composer/sidecar/IntelligenceSidecar.tsx` | `test/composer-chrome-geometry.qa.mjs`; `test/result-browser-host-parity.test.ts` | Headless narrow-drawer / overflow checks only; real-device fit remains pending | PARTIAL |
| CMP-GOV-01 | `src/core/composer/capabilityContracts.ts`; `src/service/composer/capabilities/registry.ts`; `src/service/composer/capabilities/documentRuntime.ts` | `test/boundary/service-layer-boundaries.test.ts`; `test/composer-capability-registry.test.ts`; `test/composer-result-renderer.test.ts`; `test/composer-writeback-adapters.test.ts` | Inherited baseline 304/306, build green; no docs/gstack import and no label dispatch in automation | COMPLETE |
| CMP-GOV-02 | `src/app/composer/composeDocumentComposerRuntime.ts`; `src/ui/view/composer/ComposerRoot.tsx`; `src/core/composer/capabilityContracts.ts` | `test/boundary/service-layer-boundaries.test.ts`; `test/composer-capability-registry.test.ts`; `test/composer-result-renderer.test.ts` | Retirement gate and honest COMPLETE status still need the final deletion proof | PARTIAL |

## T4 / T5 / T6 placeholders

These are intentionally left as update targets for the primary integrator:

| Task | Current outcome | Final outcome |
| --- | --- | --- |
| T4 fixture QA regression | pending rerun | TBD |
| T5 real Obsidian QA#2 | owner-involved pending | TBD |
| T6 deletion gate | parity evidence pending | TBD |

## Notes for the integrator

- Do not upgrade the overall verdict to `COMPLETE` until `QA#2` and the deletion gate are both integrated.
- If any future diff changes the evidence model, keep the table aligned with the exact `Requirement ID` set above.
- The production/test paths in this file were checked against `9f489bb0`; do not rewrite them to paths from later commits unless the traceability note is refreshed in the same change.
