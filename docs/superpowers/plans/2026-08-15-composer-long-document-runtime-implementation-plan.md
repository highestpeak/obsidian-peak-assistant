# Composer 长文档运行时实施计划

## 执行原则

先建立纯数据与事务测试，再接 UI。每一步都删除或迁移对应旧路径，不留下全文渲染 fallback。每个 checkpoint 先跑 focused tests；最终跑 production build、完整相关套件、压力测试和真实 Obsidian。

## 内部 DAG

```text
A 配置与测试基线
├─ B Prepared session ──────────────┐
├─ C Layout index + virtual window ├─ F unified locator ── H real-host QA
├─ D candidate index + acceptMany ─┤
└─ E pin registry ─────────────────┘
        ├─ G1 focus / IME / flush
        ├─ G2 selection / find / comments / history
        └─ G3 drag / autoscroll
```

## A. 合同与基线

1. 在 Composer config JSON 与 fallback 增加 `virtualization` 和 `preparation` 配置。
2. 写 config drift test。
3. 写 layout index 的估高、测量、二分 range、pin、scroll anchor 和 5000 块有界测试。
4. 写 candidate group 的 revision、overlap、一次 commit/reparse/notify/undo 测试。
5. 写 prepared session 的一次消费、path 校验、过期和失败不切换测试。

Checkpoint：新测试先红，确认失败来自缺少的新合同。

## B. Prepared session

1. 新增 app-owned `ComposerPreparedSessionStore`，由 `DocumentComposerRuntime` 实例持有。
2. `prepareSession(filePath)` 读取并解析，返回 token；`consumePreparedSession(token, filePath)` 一次性取出。
3. 扩展 Composer view state 加可选 preparation token，并保持旧 workspace state 兼容。
4. Router 在 Markdown → Composer 前 prepare；失败保留原 leaf。
5. Controller 构造/绑定时优先 adopt prepared session，避免第二次 read/parse。
6. 恢复路径使用带 file identity 的 skeleton，直到 snapshot 到达。

Checkpoint：router/controller/view-state focused tests。

## C. 布局索引与窗口化

1. 实现纯数据 `ComposerBlockLayoutIndex`：block order、kind estimate、measured height、prefix offsets、binary search、total height。
2. 实现 `useComposerVirtualWindow`：监听 `.pk-composer-main` scroll/resize，计算 range，维护 anchor，批量接收 ResizeObserver 测量。
3. 用 top/bottom spacer + window rows 替换 `visibleBlocks.map`。
4. folding/reparse 后迁移 measurement；删除全文 map 路径。
5. 在 root 增加诊断 dataset，压力测试断言 mounted 与 total 解耦。

Checkpoint：layout tests、Composer DOM test、5000 块压力 test。

## D. 候选索引与原子批量接受

1. 根订阅生成 `candidatesByBlockId`，行组件删除 `useBlockCandidates`。
2. findings 在根按 block id 建索引。
3. 扩展 candidate runtime port：`acceptMany(candidateIds)`。
4. Hub 实现 group preflight、operation 归并、一次 commit、统一 accepted、一次最终 notify。
5. Capability runtime 拒绝 native-file candidates 进入 Markdown group，并保留单候选 accept。
6. Review bar 增加“接受全部可安全合并的当前文档改动”，错误保持所有候选不变。

Checkpoint：transaction atomicity/candidate variants/review navigation tests。

## E. Hard-pin registry

1. 实现 owner-scoped pin registry，owner 为 focus、composition、flush、panel、drag、reveal、selection。
2. 每个 owner acquire/release 幂等；block id reparse 时通过 `matchBlocks` 迁移。
3. 超过配置上限时输出诊断并拒绝非关键 pin；focus/composition/flush 永不被驱逐。
4. 组件卸载时清理 owner，测试无泄漏。

Checkpoint：pin lifecycle tests。

## F. 统一 locator

1. 实现 `ComposerVirtualLocator`：按 block/source resolve、展开 section、计算 scrollTop、等待 mount、精确 DOM reveal。
2. 迁移 candidate、find、comment、history、source location 和外部 reveal。
3. 修正 scroll owner 为 `.pk-composer-main`；程序化滚动走同一 intent 标记。
4. 删除调用方直接全文 `querySelector + scrollIntoView` 的路径。

Checkpoint：document-location、find、comment/history locate tests。

## G. 交互迁移

### G1 Focus / IME / flush

将 active editor、composition owner、pending flusher 接入 pin registry。`compositionend -> flush -> release`，blur 只有在无 pending flush 时释放。

### G2 Selection

把 durable selection 存为 source offsets；DOM Range 只投影当前窗口。复制、格式、评论、AI 指令读取 source range。滚动和反向选择不丢 anchor。

### G3 Drag

用 document-space pointer Y 查询 layout index，替换全 DOM drop index。autoscroll 每帧重新计算；drop 操作仍由原 transaction engine 提交。

Checkpoint：production composition、cross-block selection、drag/autoscroll QA tests。

## H. 验证、清理与提交

1. 跑所有 Composer focused tests 和 build。
2. 生成 1000/5000 块 deterministic fixture，只用于测试，不进入用户 Vault。
3. 用目标文档做 10 次首开与滚动；记录 DOM/editor/pin/heap/long-task 指标。
4. 通过 CDP 验证真实 Obsidian 的首开、定位、IME、选择、drag、批量接受和 Undo；必要交互用短视频。
5. 比较验证窗口内新增 crash reports。
6. review diff，确认不含主工作区已有改动、runtime data、录屏或私有 Vault 内容。
7. 只提交本任务文件，英文 commit message。

## 任务完成定义

只有规格中的全部完成条件都有对应证据，才可称为完整实现。若 CDP 不可用，代码可以提交，但交付必须标 `INTERACTION NOT VERIFIED` 并列出仍需 owner 执行的准确流程。
