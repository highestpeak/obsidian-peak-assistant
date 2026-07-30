# Composer 文件视图与 Intelligence 执行说明

> 日期：2026-07-29
> 交付状态：`PARTIAL`
> 交互状态：`INTERACTION NOT VERIFIED`
> 来源分支：`codex/composer-file-view-intelligence`
> 已写回分支：`codex/peak-modernization-refactor`
> 当前工作区：`/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant`
> 基线：`cc7744eeeff9ebcd0fc578393238b0e185340510`

## 1. 结论

本轮已经把 Composer 从 active-file follower 改为显式 file-bound View，并修复了
“点击 AI 动作后候选和 action row 同时消失”的运行反馈黑洞。文件路由、同 leaf
View 转换、两种显示状态、共享 Intelligence owner、Work Segment、Scope、Frozen Run、
Native Markdown companion 和 JSONL machine-state replay 已接入生产 composition。

当前不能标记 `COMPLETE`，原因是：

1. 当前没有运行中的 Obsidian CDP listener，真实 Obsidian 的 restore、动态标题、
   pane menu、同 leaf 转换、未保存 CodeMirror buffer 和指针/键盘流程未按验收合同验证；
2. 全量测试仍有 4 个基线既有失败，虽然本任务新增和修改的 Composer tests 已全部通过。

## 2. 根因

AI provider 并没有同时失效。候选在 provider 调用前已经创建，真正的黑洞来自旧显示合同：

- 默认状态是 `work`；
- inline candidate 只有 `displayState === "all"` 才渲染；
- 只要 candidate 存在，block action row 就被隐藏；
- 因而默认状态下卡片和 action row 同时不可见；
- 同步 invoke 错误还被空 `catch {}` 吞掉；
- analysis 卡对 failed / cancelled / stale 没有完整正文与恢复动作。

这个回归与之前 AI 卡样式 / 三态显示改动有关，但不能通过回退整个历史提交解决，因为同一
提交还包含其他 Composer 能力。本轮只迁移显示状态和候选生命周期。

## 3. 已实现

### 3.1 File-bound Composer

- 新增 versioned `ComposerViewStateV2`，以 `filePath` 为 leaf identity；
- 旧 `file`、`work`、`all` state 只读迁移到 V2 `edit / clean`；
- Controller 改为 `start(filePath)` / `bindFile(filePath)`，删除 active-file follower；
- 多 Composer leaf 可以绑定不同文件；同文件 leaf 共享 app-owned document runtime；
- tab 标题使用文件 basename；
- rename 保持稳定 document identity、更新 registry key 和 leaf title；
- delete 显示 missing，同时保留只读 Intelligence / History runtime；
- 全部 View 关闭后重新打开，会把缓存 runtime 对齐到当前文件 revision。

### 3.2 App-owned 文件路由

- 新增 `ComposerDocumentRouter`；
- 默认 future-open policy 持久化到 `settings.composer.defaultDocumentView`；
- 默认值为 Native Markdown；
- 支持 `reuse-existing / replace-current / new-tab / split`；
- 只拦截 Markdown；
- router 自己发起的 open/convert 有 re-entry guard；
- Markdown -> Composer 转换前先 `save()`；
- 转换后验证 leaf 类型和同一文件；失败恢复原 `ViewState`；
- Composer pane menu 提供切回 Native Markdown；
- Native Markdown file menu 提供切到 Composer 和打开 Intelligence；
- Quick Search、Vault navigation、File Atlas 的 Markdown 打开接入同一路由；
- 精确行号定位仍保留 Native Markdown，因为 Composer 尚无 source-line locator。

### 3.3 App-owned Intelligence

- `DocumentComposerRuntime` 维护 document runtime registry；
- leaf close 只 release lease，不取消 still-running Run 或待 review candidate；
- Composer 与 Native Markdown companion 复用同一 session、hub、candidate、History、
  Intelligence 和 workspace owner；
- 新增 workspace 级 Work Segment、Scope 和 Frozen Run Registry；
- Scope 支持当前文档、当前工作段和固定范围；
- 第一项真实任务自动建立 Work Segment；打开相关文档可加入当前 segment；
- Frozen Run 保存 origin document/path/revision/host/leaf/work segment/scope/action/target；
- Native Markdown 发起的 Run 正确记录 `originHost = "markdown"`；
- Scope/View/file 切换不会移动已有 Run；
- 外部 revision 漂移会立即把 candidate 和 Run 标 stale；
- late provider completion 不能把 stale candidate / Run 重新覆盖成 ready；
- 知识库 DataStore 下的 `records/composer/workspaces/current.jsonl` 保存 machine events；
- Frozen Run 同时保存可序列化 candidate payload、variant 状态和 capability/image
  renderer runtime metadata；
- hydration 处理 workspace leaf 比 JSONL read 更早恢复的竞态；
- reload 时 ready/failed/cancelled/stale candidate 会重新绑定原 runtime 并恢复为可操作
  review card；
- reload 时未完成 Run 明确恢复为 `interrupted`，对应候选显示 failed，不自动重复执行；
- 同一 candidate 的多次 regenerate run 在接受/丢弃后会一起清除 review snapshot，
  防止旧卡片在下次 reload 后复活。

### 3.4 显示状态与 AI 反馈

- 顶层只保留 `编辑视图 / 纯净阅读`；
- `全部改动` 变为 `审阅全部改动 · N` 上下文动作；
- edit 中 active/streaming candidate 自动展开，其他候选可收起和逐个打开；
- clean 只隐藏 candidate projection，不删除状态；
- AI invoke 后同步 candidate 立即可见；
- 首 token 前显示状态、caret 动画、`aria-live` 和取消动作；
- streaming / ready / failed / cancelled / stale 都有可见终态；
- provider failure detail 持久在 active variant 上；
- failed / cancelled 可 retry，stale 可 rerun；
- analysis card 无 accept，但有关闭、取消、重试和 stale 重跑；
- invoke 同步错误显示在 origin block，不再静默吞掉；
- action row 只有在 candidate 实际可见时才隐藏；
- reduced-motion 下停用持续动画。

## 4. 旧路径退休

以下生产路径已经删除或替换：

- `ComposerFileEventsPort.getActiveFilePath`；
- `ComposerFileEventsPort.onActiveFileChange`；
- Controller active-file 主文档重绑定；
- ViewManager reveal 第一个无关 Composer leaf；
- `work / all / clean` 三态运行真相；
- `displayState === "all"` candidate gate；
- cancelled 映射为 failed；
- block AI invoke 空 catch；
- Native/Composer 两套独立 Intelligence runtime。

source guard 覆盖 active follower、单 Composer leaf 和旧显示状态，防止回流。

## 5. 验证

### 5.1 任务相关验证

通过：

- `composer-file-view-state`
- `composer-view-lifecycle`
- `composer-multi-leaf`
- `composer-open-policy`
- `composer-old-follower-retirement`
- `composer-display-state-contract`
- `composer-ai-action-feedback`
- `composer-analysis-candidate`
- `composer-workspace-intelligence`
- `composer-review-reload`
- `composer-image-candidate-routing`
- `composer-capability-vertical-slice`
- `composer-inline-candidate-placement`
- `composer-production-composition`
- `composer-owner-feedback-contract`
- Composer sidecar geometry / visual contract

`npm run build` 通过，包括：

- CSS 两阶段构建；
- production esbuild；
- `node --check main.js`；
- simulator boundary；
- SDK copy。

### 5.2 全量测试

`npm run test`：

```text
356 passed / 360 total
```

剩余 4 个失败与本任务未修改的基线目标一致：

- `chat-studio-message-state-ui`
- `code-block-theme-settings`
- `composer-architecture-source-guards`
- `composer-frontmatter-inline-tag-candidate`

本任务中一度暴露的 cancelled contract、candidate placement 和 sidecar selector 回归均已修复。

### 5.3 真实 Obsidian

预检与交付时均未发现：

```bash
lsof -nP -iTCP -sTCP:LISTEN | rg '^Obsidian'
```

因此没有使用 Computer Use 坐标点击替代 CDP，也没有生成伪实机证据。以下场景必须在
CDP 可用后补验：

1. V2 workspace restore；
2. 多 Composer tab 与同文件 duplicate；
3. rename 后动态标题；
4. Native Markdown 未保存 buffer -> Composer；
5. Composer -> Native Markdown 同 leaf 回滚；
6. 文件树、wikilink、Quick Search、File Atlas 默认路由；
7. Native Markdown companion 与 Composer sidecar 共享 Run；
8. AI first-token、cancel、retry、stale 和 review-all；
9. clean -> edit 后候选恢复；
10. plugin reload 后 Work Segment/Scope、terminal review card 和 Run interrupted 投影。

## 6. 剩余工作

进入 `COMPLETE` 前还需：

1. 在真实 Obsidian 运行上述 CDP 验收并保存 reference/current/manifest 证据；
2. 判断并处理 4 个基线失败，或以单独已批准基线合同排除；
3. 实机确认宿主 `file-open` 对原生文件树重复 leaf 的行为；若 Obsidian 没有可取消的稳定 API，
   在 router 中保留公开 API 降级并记录限制；
4. 为同名文件补充经过实机验证的完整 path tooltip / aria；
5. 完成后再更新 `docs/progress.md`。

## 7. Git 状态

- 实现已从隔离 worktree 写回原工作区；
- 原工作区已有的 AI Search、Embed Selection、telemetry 和规划文档改动均保留；
- `src/service/composer/ports.ts` 与 `templates/config/composer.json` 的并行修改已按独立
  hunks 合并并通过专项测试；
- 未 stage；
- 未 commit；
- 未 push。

## 8. 2026-07-30 实机反馈修正

Owner 实机确认多 Composer tab 可用，但默认 Composer 打开会出现“无法切换文档视图，
已恢复原视图”，并指出标题下方的 Scope / Work Segment 整排控件层级过高。

修正：

- 默认设置本身已经生效；失败点是 Obsidian `file-open` 尚未完成时立即做同 leaf
  View conversion，宿主最后一次 Markdown state 写入与 Composer state 竞争；
- host-open conversion 现在等待 leaf owner window 的下一帧，再重新核对默认值、文件、
  leaf 和过期 ticket 后转换；
- 快速连续打开时，旧 ticket 不再转换已经过期的 leaf 状态；
- conversion failure 记录 file path 和真实 error，不再只有泛化 Notice；
- `DocumentComposerView` 在 `setState` 晚于 `onOpen` 时也会建立 controller，避免生成
  已有 file state 但没有 document runtime 的空 Composer View；
- Scope 从 Intelligence 标题下方的第二排一级 segmented control 移入 Copilot 内容区，
  收敛为“范围 · 当前文档”菜单；
- 当前文档、当前工作段、固定范围，以及开始/结束工作段都在该次级菜单内；
- History 不显示 Scope 控件。

验证：

- `composer-open-policy`、`composer-view-lifecycle`、`composer-file-view-state`、
  `composer-sidecar-visual-contract`、`composer-workspace-intelligence`、
  `composer-config`、`composer-production-composition` 和
  `shared-button-reset-defense` 全部通过；
- `npm run build` 通过；
- 当前仍无 Obsidian CDP listener，因此修正后的真实默认打开与 Scope 菜单交互仍标记
  `INTERACTION NOT VERIFIED`，需要 plugin reload 后复测。
