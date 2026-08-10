# Peak Sheet production implementation note

> 日期：2026-08-10
>
> 分支：`codex/peak-sheet-implementation-plan-20260810`
>
> 状态：生产源码与自动化验证已完成；真实 Obsidian 交互和七天 dogfood 尚未完成

## 1. 交付结论

Peak Sheet 已从 research / mock 进入生产源码，形成一个本地、单用户、AI 可读写的数据工作台。它使用一份 canonical Dataset revision；Table、Chart、Board、Calendar 是同一份数据的投影。用户操作、AI 写入、Board move、Calendar date change、Undo 和 Redo 最终都经过同一个 typed patch 与 revision gate。

当前实现满足“可进入真实宿主验收”的工程门槛，但尚未满足产品冻结门槛。没有 CDP 证据的 Obsidian 交互保持 `INTERACTION NOT VERIFIED`；没有用三张真实表连续七天，因此不能从 Planned Requirements 移除。

## 2. 已实现范围

### Dataset、字段和 Table

- 全局 `Create Peak Sheet` 命令可一步创建空表、打开工作台并定位新表；表格也可在侧栏创建、重命名、软删除和 JSON 导出；
- 行新增、删除、复制和批量删除；
- 字段新增、删除、重命名、隐藏和宽度调整；
- Text、Number、Date、Single Select、Checkbox、Link、File 七种字段；
- cell direct edit、矩形/离散选区、选区统计、TSV copy / paste；
- sort、filter、group、saved view 创建、重命名和删除；
- 一个 paste 作为一个原子 patch，错误类型不会部分写入；
- 三张 starter dataset：Peak Assistant Launch Tracker、Beta Feedback、Launch Content。

### 四个视图

- Table：同一 filter/sort projection 下编辑和选取；
- Chart：Recharts bar / line / pie，支持 category、aggregate 和同源过滤；
- Board：Single Select lane，pointer drag 与可键盘操作的 lane selector 共用 `setCell`；
- Calendar：简单 month view，日期点击新增、标题编辑和拖动改日期共用 typed patch。

### 公式、导入与文件

- HyperFormula adapter 支持 `[Field name]` 行公式和只读计算列；字段重命名会同步更新引用，公式切换可 Undo；
- CSV、扁平 JSON Array 和 XLSX multi-sheet import；XLSX 先显示 workbook / worksheet、行列数和兼容性损失，用户选择 worksheet 后才写入；
- XLSX 明确丢弃样式、条件格式、图表、宏和数据透视表，公式只读取 cached result；
- XLSX 同时限制输入字节、worksheet 行列、ZIP entry 数和 expanded bytes，避免无界 workbook / zip bomb；
- File cell 保存稳定 Vault ref；现有 Vault 文件可 hover preview；外部文件经用户显式选择后复制到 Peak media attachment 目录。

### 本地持久化和同步

- `UA-16 peak-sheet.dataset`：每个 Dataset 的 canonical JSON snapshot；
- `DR-25 peak-sheet.dataset-events`：每个 Dataset 的 JSONL create / patch / undo / redo event；
- 写入顺序为 event-first、snapshot-second；snapshot 落后时可从 event replay 恢复；
- create event 携带完整 recovery checkpoint；
- stale base revision 直接拒绝，进程内写入按 Dataset 串行；
- app-owned `PeakSheetRuntime` 在 `AppRuntimeRegistry` 绑定并在 unload 对称清理；
- 同进程多个视图通过 revision subscription 收到更新，不建立云同步或第二数据真值。

### AI 读写与安全分析

Chat / harness 注册了五个工具：

- `peak_sheet_list`
- `peak_sheet_query`
- `peak_sheet_analyze`
- `peak_sheet_patch`
- `peak_sheet_create`

list/query/analyze 是 read tool；patch/create 是 edit tool，复用现有 permission preview / accept gate。所有 mutation 必须带 Dataset revision，并经过与 UI 相同的 patch validator。分析只接受白名单 `AnalysisPlan`：filter、sort、group、aggregate、topN、dedupe、cast、derive、chart；行数、分组数和输出字节受限，不允许任意 JavaScript / Python 执行。

## 3. 依赖裁决

| Dependency | Version | License | 用途与裁决 |
| --- | --- | --- | --- |
| Recharts | 3.8.1 | MIT | 已有依赖，继续用于 Chart |
| HyperFormula | 3.3.0 | GPL-3.0-only | 仓库本身是 GPL-3.0，使用 `gpl-v3` key；保留许可证、notice 和对应源码义务 |
| ExcelJS | 4.4.0 | MIT | bounded XLSX snapshot import；不承担 Excel round-trip |
| JSZip | 3.10.1 | MIT OR GPL-3.0-or-later | 只做 XLSX archive metadata preflight |

许可证采用结论和 release obligation 已写入根目录 [`THIRD_PARTY_NOTICES.md`](../../../THIRD_PARTY_NOTICES.md)。ExcelJS 的 transitive `uuid` 已通过 package override 固定到无该已知 audit finding 的版本。没有运行破坏性的 `npm audit fix --force`；仓库其余 audit 债务不属于本次 Peak Sheet 变更。

## 4. 自动化证据

- 8 个 focused suites：全部通过；覆盖 core patch / formula / 500-row compute / clipboard、runtime / persistence / stale conflict、AI tools、XLSX bounds、production wiring、tool availability 与 command gateway；
- 全量测试：`453 passed / 5 failed / 458`；5 个失败均来自本任务开始前的独立基线：code-block theme、Composer source guard、frontmatter tag candidate、一个未登记的 Custom Prompt writer、inline prompt guard；
- `npm run build`：通过 CSS、production esbuild、bundle syntax 与 simulator-boundary；
- 新增 Peak Sheet 路径的 `tsc --noEmit` 过滤检查：无诊断；仓库完整 TypeScript 检查仍有既有 dependency / media typing debt；
- `git diff --check` 在提交前执行。

## 5. 尚未升级为通过的验收

- 真实 Obsidian：当前运行环境没有 CDP listener，也没有已经打开的 DevTools，按维护协议没有用 Computer Use 坐标点击、猜快捷键或重启插件。Table IME、clipboard permission、Board / Calendar drag、hover preview、focus restore、Undo sequence 和 plugin-only reload 均为 `INTERACTION NOT VERIFIED`；
- 性能：纯计算测试覆盖 500 行，但 owner-device 的 paint、scroll、input 和 save p95 尚未锁定；
- XLSX：自动化覆盖 multi-sheet、类型推断、archive bounds、选择 worksheet 后才创建 Dataset；真实文件选择器、review modal 与取消零写入交互仍为 `INTERACTION NOT VERIFIED`；
- Dogfood：三张真实表连续七天未完成。

## 6. 冻结规则

本提交完成的是 production implementation，不是 G8 产品冻结。只有真实 Obsidian 交互、200–500 行 owner-device 证据和七天 dogfood 全部通过后，才更新 Roadmap / Planned Requirements 为已交付。任何新增 Relation、Rollup、Pivot、automation、多人协作、云同步、完整 Excel compatibility、条件格式或 arbitrary code execution，继续留在 post-launch 范围之外。
