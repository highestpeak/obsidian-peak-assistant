# T11R 全硬拆 - Phase 1 部分交付 + Blocker Report

> **状态**：未达成 total flagged = 0。Per stop rule，给出明确 blocker report 后 commit。
> **闭合**：38 → 30 findings（-8）。
> **未闭合**：30 findings，详见下文 cluster 分组。

## 核心结论

T11R prompt 要求"一次 prompt 内完成尽可能完整的 hard boundary closure，不要再拆成 T11R-A/B/C 小回合"。我**没能在单 turn 内达成 total = 0**。理由（诚实评估）：

1. **真实规模**：38 个根 findings × 平均 3-5 个 caller cascade ≈ 120-180 文件 touch，加上端口设计、app 适配器编写、回归测试更新，是 multi-day 工程。
2. **chat-storage 集群尤其深**：`ChatStorageService`（963 行）有 30+ 处 `app.vault.*` 直接调用，被 `service-manager`/`service-conversation`/`service-project`/`PromptService`/`UserProfileService`/`ResourceSummaryService`/`ContextUpdateService` 七个 service 依赖。任意一个的 `app: App` 字段都要换成 narrow port，整链条都要在同一次提交里完成才不会破坏 build。
3. **index/search 集群同样深**：`indexService` / `indexUpdater` / `indexInitializer` / `CascadeWorker` / `buildBackboneMap` / `cost-estimator` / `intuitionPrep` 七文件互相调用，必须同步重构。
4. **单 turn token / 工具调用预算**：交付完整 cascade 需要的 sequential edit + verify 循环超出了单次 conversation 的可持续工作量。

按 stop rule，我没有触碰 scanner 阈值，没有引入 EverythingPort / RuntimeBag / AppHandle 大口袋，没有新增 module-level mutable runtime singleton。

## Phase 1 实际交付（8 findings 闭合）

### 新增 narrow ports（10 个文件）

`src/core/ports/`：
- `VaultWriterPort.ts` — read/modify/create/trash/rename/ensureFolder/createBinary（neutral refs）
- `VaultLookupPort.ts` — getFile / getFolder / exists
- `VaultEventPort.ts` — onCreate/Modify/Delete/Rename + offref（opaque tokens）
- `HostMetadataPort.ts` — getFileCache / getResolvedLinks / getFirstLinkpathDest + `CachedMetadataSnapshot` 结构类型
- `WorkspaceObserverPort.ts` — getActiveFile / onFileOpen / getVaultName / getLastOpenFilePaths
- `HttpClientPort.ts` — cross-origin request port (`requestUrl` 替换)
- `NotifierPort.ts` — `Notice` 替换，含 `setMessage/hide` handle
- `PlatformPort.ts` — `isMobile/isDesktop` via `process.versions.electron`，无 obsidian 依赖
- `WorkspaceBusPort.ts` — emit/subscribe + opaque unsubscribe

`src/core/ports/VaultFileRef.ts`（扩展）：
- 加上 `parent?: VaultFolderRef | null`
- `VaultFolderRef` 加上 `children?` 和 `parent?` —— 结构上仍兼容 obsidian 的 `TFile.parent` / `TFolder.children`

### 新增 app-side / ui-side adapters（3 个文件）

- `src/app/adapters/HttpClientAdapter.ts` — `obsidianHttpClient`（`requestUrl` 适配）
- `src/app/adapters/NoticeNotifier.ts` — `obsidianNotifier`（`new Notice()` 适配）
- `src/ui/util/uiHttpClient.ts` — UI 本地 HTTP client，避免 ui→app 违规
- `src/app/vault/vault-helpers.ts` — 重复实现 `ensureFolder/uploadFileToVault/writeFile/openAttachment/readVaultTextSnippet`，为 Phase 2 chat-storage cascade 准备（目前未被使用，旧 `core/utils/vault-utils.ts` 保持不变）

### 闭合的 8 个 findings

| # | 文件 | 旧 | 新 |
| - | --- | --- | --- |
| 1 | `src/core/platform.ts` | `import { Platform } from 'obsidian'` | re-export `PlatformPort` 纯 process 检测 |
| 2 | `src/core/providers/testProviderConnection.ts` | `import { requestUrl } from 'obsidian'` | `HttpClientPort` 注入（首参数）|
| 3 | `src/core/storage/sqlite/NativeModuleManager.ts` | `import { requestUrl, Notice } from 'obsidian'` | `HttpClientPort + NotifierPort` 通过 `configure()` 注入 |
| 4 | `src/service/copilot/CopilotActionRegistry.ts` | `import type { TFile } from 'obsidian'` | `VaultFileRef` |
| 5 | `src/service/copilot/actions/CopilotActionPorts.ts` | `import type { TFile } from 'obsidian'` | `VaultFileRef` |
| 6 | `src/service/copilot/frontmatterTagWriter.ts` | `import type { TFile } from 'obsidian'` | `VaultFileRef` |
| 7 | `src/service/copilot/panels/CopilotPanelPorts.ts` | `import type { TFile } from 'obsidian'` | `VaultFileRef` |
| 8 | `src/core/types/chat-vault.ts` | `import type { TFile } from 'obsidian'` | `VaultFileRef` |

### Caller 改动

- `main.ts` —— 注入 `obsidianHttpClient + obsidianNotifier` 给 `NativeModuleManager.configure()`
- `src/ui/view/settings/components/ProfileCard.tsx` — `uiHttpClient` 作为 `testProviderConnection` 首参数
- `src/ui/view/modals/onboarding/ProviderForm.tsx` — 同上（两处调用）

### 验证

- `npm run build` ✅
- `npm run audit:boundary` → 30 findings（-8）
- T11P 回归 ✅（ui→app=0 守住，新增 `uiHttpClient` 间接路径）
- T11O 回归 ✅
- service-ui 回归 ✅
- T11Q 回归 ✅
- `boolean-expression-parser` test 失败 = **pre-existing on master HEAD**（git stash 验证），不是 T11R 引入

## 剩余 30 findings 的 cluster 化

### Cluster A：chat storage 深 cascade（10 findings，必须整链同步改）

- `src/core/storage/vault/ChatStore.ts` — 30+ 处 `app.vault.*`，被 7 服务依赖
- `src/core/storage/vault/chat-docs/ChatDocName.ts` — `Vault/TFile/TFolder` runtime
- `src/service/chat/service-manager.ts` — `app: App` 字段 + `EventBus.getInstance(app)`
- `src/service/chat/service-conversation.ts` — `app: App` 字段 + `uploadFilesToVault(app)`
- `src/service/chat/service-project.ts` — `app: App` 字段
- `src/service/chat/context/UserProfileService.ts` — `app.vault.*` 直接调用
- `src/service/chat/context/ResourceSummaryService.ts` — `app.vault.*` 直接调用
- `src/service/prompt/PromptService.ts` — `app.vault.*` 直接调用

**Phase 2 计划**：让 `ChatStorageService` 接受 `VaultWriterPort + VaultLookupPort + VaultEventPort` 替代 `app: App`。`service-manager` / `conversation` / `project` 取消 `app` 字段，转而接受这些 ports（外加 `WorkspaceBusPort` 给 EventBus）。`PromptService/UserProfileService/ResourceSummaryService` 同样换 port。

### Cluster B：index/search（8 findings）

- `src/service/search/index/indexService.ts` — `TFile` runtime（`instanceof TFile`）
- `src/service/search/index/indexUpdater.ts` — `App/EventRef/TAbstractFile/TFile` runtime（vault events）
- `src/service/search/index/indexInitializer.ts` — type-only `App` + 依赖 `core/utils/obsidian-utils#getFileSize`
- `src/service/search/index/cascade/CascadeWorker.ts` — type-only `App`，但 `eventRefs: any[]` 实际持有 obsidian EventRef
- `src/service/search/index/helper/backbone/buildBackboneMap.ts` — `TFolder` runtime
- `src/service/search/support/cost-estimator.ts` — `TFile/App` runtime
- `src/service/agents/intuition-helper/intuitionPrep.ts` — `TFolder` runtime + `Vault` type-only
- `src/service/tools/search-graph-inspector/explore-folder.ts` — `TFile/TFolder/Vault` runtime

**Phase 2 计划**：take `VaultLookupPort + VaultEventPort + DocumentVaultReaderPort`。`instanceof TFolder` → duck-typing `'children' in ref && !('extension' in ref)`。

### Cluster C：vault utils 迁移（3 findings）

- `src/core/utils/obsidian-utils.ts` — heavy `app.vault.*` + `getActiveNoteDetail/openFileAtLine/getSelectedTextFromActiveEditor`
- `src/core/utils/vault-utils.ts` — `ensureFolder/uploadFileToVault/writeFile/openAttachment/readVaultTextSnippet`
- `src/core/template/VaultContentProvider.ts` — `app.vault.configDir + adapter.read`

**Phase 2 计划**：物理迁移整个文件到 `src/app/vault/`（`vault-helpers.ts` 已为 vault-utils 准备好基础）。`core/utils/path-utils.ts` 保留纯 path helpers。约 14 个 caller 改 import 路径（其中 5 个在 service 端，需先完成 Cluster A 的 port 替换）。

### Cluster D：core/eventBus 拆分（1 finding）

- `src/core/eventBus.ts` — `App` runtime（`workspace.trigger/on/offref`）

**Phase 2 计划**：events 类型定义留在 `core/eventBus.ts`，`EventBus` runtime class 移到 `src/app/events/AppEventBus.ts`，通过 `WorkspaceBusPort` 实现。所有 `EventBus.getInstance(app)` 调用点改为 DI 注入。

### Cluster E：SDK/MCP/Skills（4 findings）

- `src/service/agents/core/sdkAgentPool.ts` — `App` 用于 `getCliPath`
- `src/service/agents/vault-sdk/vaultMcpServer.ts` — `Vault/MetadataCache/CachedMetadata/TFile/App` type-only
- `src/service/agents/harness/curator/envProbe.ts` — `App + TFile` runtime
- `src/service/skills/SkillRegistry.ts` — `App/TFile/TAbstractFile` runtime

**Phase 2 计划**：
- `sdkAgentPool`: take `cliPath` string or `getCliPath: () => string` 注入
- `vaultMcpServer`: 已经是 type-only，可以纯结构化替换为 `VaultLookupPort + DocumentVaultReaderPort + HostMetadataPort`
- `envProbe`: 接受 `DocumentVaultReaderPort`
- `SkillRegistry`: 接受 `VaultLookupPort + VaultEventPort + VaultWriterPort#read`

### Cluster F：context/copilot misc（4 findings）

- `src/service/context/ContextProvider.ts` — type-only `App/TFile/CachedMetadata`
- `src/service/context/SessionContextService.ts` — type-only `App/TFile/EventRef`
- `src/service/copilot/CopilotReviewHistoryService.ts` — `TFile/App/TFolder` runtime（vault read/write）

**Phase 2 计划**：
- `ContextProvider`：take `WorkspaceObserverPort + HostMetadataPort`
- `SessionContextService`：take `WorkspaceObserverPort + EventBus`
- `CopilotReviewHistoryService`：take `VaultWriterPort + VaultLookupPort`

## Phase 2 实施顺序（依赖 DAG）

1. **Phase 2.1 — app 适配器**：
   - `src/app/adapters/VaultPortAdapter.ts`（实现 `VaultWriterPort + VaultLookupPort`）
   - `src/app/adapters/VaultEventPortAdapter.ts`
   - `src/app/adapters/HostMetadataAdapter.ts`
   - `src/app/adapters/WorkspaceObserverAdapter.ts`
   - `src/app/adapters/WorkspaceBusAdapter.ts`

2. **Phase 2.2 — Cluster C 物理迁移**（最低耦合）
3. **Phase 2.3 — Cluster D EventBus 拆分**
4. **Phase 2.4 — Cluster F context/copilot**
5. **Phase 2.5 — Cluster E SDK/MCP/Skills**
6. **Phase 2.6 — Cluster B index/search**
7. **Phase 2.7 — Cluster A chat storage**（最深 cascade，最后做）
8. **Phase 2.8 — 回归 guard + 验证**

每个 Phase 2.x 都需要独立 turn 实施 + 回归。

## 给 owner 的建议

T11R 这种全硬拆 wave，real-world cost 是 **3-4 个 work session**。建议要么：
- **A**：接受这次 commit 的 Phase 1，分 2-3 个后续 turn 走完 Phase 2.1-2.8（违反"不拆"指令但符合实际）。
- **B**：revert 本 commit，重新评估 scope。比如把 chat-storage cascade 单独定义为 T11R-Chat 单波（其他 cluster 当作 T11R-Substrate），明示分波。
- **C**：保持本 commit 作为永久 baseline（无需 Phase 2），把 Phase 2 各 cluster 当作 backlog 用户按需触发。

我推荐 **A**：基础设施（10 ports + 3 adapters）已经就位，Phase 2 各 cluster 是"调端口"的机械工作，每 cluster 在一个 turn 内可以闭合。

## 禁区清单（本 commit 全数遵守）

- ❌ 没改 boundary scanner 阈值或分类
- ❌ 没引入 ui→app / service→app / service→ui / core→upstream
- ❌ 没创建 EverythingPort/AppPort/HostServices/RuntimeBag 大口袋
- ❌ 没新增 module-level mutable runtime singleton
- ❌ 没用 `any` 或宽泛 AppHandle 假装完成
- ❌ 没用 `import("obsidian")` 动态绕过 audit
