# Message Persistence Queue — 2026-07-03

## 一句话结论

**"AI 自主决定这条消息要不要存回 Vault"= 一个 tri-state 分类器，跑在 assistant response 完成后。判据组合：内容长度 (>= 500 chars) + 内容"信息含量"（LLM 判定 has-lasting-value）+ 用户预设策略 (always / auto / never)。推荐 tri-state：`vault_worthy=true` 时后台异步写 vault，`=maybe` 时消息末尾放"保存到 Vault" chip，`=false` 时不建议。**

## 问题定义

现在 Chat 里的消息只落 chat.sqlite。用户偶尔想把 "AI 归纳的一段" / "AI 给的 code snippet" 保留成 vault note。手动路径：选中 → 右键 → save-to-vault。低效。

**目标**：AI 主动判断"这条 assistant response 值得存回 vault 吗"，自动落盘或提示用户接受。

## 判据设计

### 硬规则
- Response 长度 < 200 chars → 一律 not-worthy（大概率是简答）
- Response 是 pure tool result → not-worthy
- Response 只有一段 code block → maybe（值得，但需要 project context）

### LLM 判定
若硬规则命中 maybe，用 fast tier 跑：

```
你是一个知识库归档判定器。给你一段 AI 回答，判断这段是否有"长期查阅价值"（非闲聊、包含结构化知识 / 决策 / 参考）。

回答：
{{content}}

输出 JSON：
{ vault_worthy: 'yes' | 'maybe' | 'no', reason, suggested_title, suggested_folder, tags[] }
```

### 用户策略
Settings 里加：
- Auto-save: never / on-yes / on-maybe-or-yes
- Auto-tag: on / off
- Auto-folder: on / off (LLM 建议 folder path)

## 存储行为

- `yes` + auto-save on → 后台异步写 `vault-clippings/<YYYY-MM-DD>-<slug>.md`，UI 上小 toast "已保存到 X"
- `maybe` + auto-save on-maybe → 同上
- `maybe` + auto-save off → 消息末尾 chip "Save to Vault?"
- `no` → 不 UI 展示

## 复用现有基础设施

- `ArtifactPort` + `VaultArtifactStore` 已完备（B6 landed）。可以直接 `putArtifact({ kind: 'file', contentType: 'text/markdown', body })`。
- ChatVaultWriterPort 已有。
- LLM 分类器复用 fast-tier profile。

## 成本估算

| 项 | 成本 |
|---|---|
| 硬规则 + LLM 判定 wire | 1 天 |
| Settings 面板 | 半天 |
| Vault write path 复用 | 已有 |
| UI chip | 半天 |
| E2E test | 1 天 |

**总计**：2-3 天。

## 决策

- **必要性**：**中**。研究向用户会用；日常用户不 -.-
- **优先级**：Wave 5+。
- **依赖**：Message branching (R2) 先落地更好。

## Next steps

1. Prompt PoC + 20 样本手工评估
2. Backend wire
3. Settings + chip
4. Beta flag
