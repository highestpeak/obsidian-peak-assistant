# AI Surfaces UI/UX Review（2026-07-09）

对三个 AI 相关 surface 的全链路 UI/UX 审阅：截图证据 + 代码根因（file:line）+ 重画 mockup + 前后对比 + 修复清单。每份文档独立成篇，可直接在浏览器打开。

| 文档 | Surface | 核心结论 |
|---|---|---|
| [01-ai-search.html](./01-ai-search.html) | Quick Search modal · AI Search tab 空闲态 | 骨架正确、交付粗糙：`{activeDocumentTitle}` 模板泄漏（fillTemplate 不校验残留）、历史无聚合、时间双份、假链接 "869 analyses"、等宽 placeholder。数据管线/列表层/视觉层各缺一道工序。 |
| [02-vault-intelligence.html](./02-vault-intelligence.html) | Quick Search modal · Vault Intelligence 面板 | 最重问题是"半接线"：Suggested intents 与 All reviews 在此嵌入点全是 no-op 空函数；placeholder 错串（SCOPE_TABS 无 vault 条目）；"143.7% word drift"/"148 notes changed" 等工程量原样倒给用户；Research/review/refresh 三词族混用。 |
| [03-document-copilot.html](./03-document-copilot.html) | Copilot Picker modal · Document Copilot tab | 问题模式是"mock 占位文案未被真数据替换就上线"："no past review" 与真实历史矛盾（硬编码）、"safe to run" 无检查支撑、tab 副标题 "= Structure" 是改名速记泄漏、双 Suggest Links 同时 recommended。 |

## 跨 surface 共性问题（应一批落地）

1. **词族统一**：Research / review / refresh / Auto 混用源于 2026-05-30 `MODE_LABELS` 单点改名未扫全 surface（`CopilotMetaAgentStream.ts:42-45`）。建议统一 review 词族，一次决策、两个 surface 同步。
2. **"Run strategy ?" 问号无 tooltip**：`PickerReadinessCard.tsx:104-107`，02/03 共用组件，改一处两处生效。
3. **recommended 通胀**：阈值 0.65 一刀切导致"每行都 recommended"；徽标只有稀缺才有信息量。
4. **假状态/死按钮零容忍**：写死的 chip（no past review / safe to run）、no-op 点击、假链接（869 analyses）是三份 review 里破坏信任的同一病根。

## 证据来源

- 截图：用户提供的三张运行时截图（2026-07-09）
- 代码：`src/ui/view/quick-search/`、`src/ui/view/copilot/`、`src/service/context/`、`src/service/copilot/`（探索报告中所有 file:line 已核对到当前 branch `codex/peak-modernization-refactor`）
