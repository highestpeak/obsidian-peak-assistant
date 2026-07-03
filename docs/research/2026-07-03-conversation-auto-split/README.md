# Conversation Auto-split — 2026-07-03

## 一句话结论

**推荐"提示 + 一键接受"模型（B 方案）：LLM 分类器判断当前 turn 是否偏离原主题；偏离且用户已经写完（发送后而不是打字中）时，弹一条 non-blocking suggestion "看起来这个话题偏移了，要不要开新会话继续？"。不做全自动、不做拦截式弹窗。**

## 问题定义

用户在一个 conversation 里聊了 30 轮，前 20 轮聊某个技术方案，后 10 轮聊别的话题。conversation history 越拉越长、context 预算越紧、context inspector 里的关联噪声越大。用户理想情况是把两个话题分开归档，但手动切分心累。

**目标**：AI 自动检测主题偏移，建议 split。

## 方案候选

### A. 全自动 split
后台每 5 轮跑一次分类器，判定偏移就 silently 建新 conversation。

- 优点：用户零操作。
- 缺点：不可控 → 用户忽然发现 chat 里少了 message；分类器错杀 → 数据丢失；对话流被打断。
- **否决**。

### B. 提示 + 一键接受（推荐）
每次用户发完消息，backend 用 fast tier 模型（Haiku / GPT-4o-mini）跑一次分类：`current_topic vs recent_topic → shift?`。若判定 shift，在下一次 render 时把一条 dismissible banner 塞进 message stream：
> "看起来你从 [X] 换成了 [Y]，要不要把接下来的话装到新会话？[开新会话] [继续当前会话]"

点 [开新会话] → clone 当前 conversation meta + starting message，用户继续从 Y 提问。原 conversation 保留完整历史。

- 优点：非拦截、可撤销、成本低（fast tier 一次 call ~$0.0001）。
- 缺点：分类精度要求高，误报会烦。
- **推荐**。

### C. 用户主动请求
右键消息 → "从这里 split conversation"。无 AI 参与。

- 优点：完全可控。
- 缺点：需要用户已经知道自己想 split → 主动动作低。
- **补充实现**：作为 fallback，永远可用。

## 分类器设计

**输入**：最近 5 轮 message（去掉 system prompt + tool results）。
**输出**：`{ shift: boolean, confidence: 0-1, oldTopic: string, newTopic: string, reason: string }`。
**模型**：Claude Haiku 4.5 or GPT-4o-mini。约 500 input tokens + 100 output tokens = < $0.0002/次。
**触发时机**：每次用户 send + assistant response 完成后。若上一次判定 no-shift，下次跳过（cache 15 min）。

## Prompt template（草稿）

```
你是一个对话主题变更检测器。给你最近的对话，判断用户当前 turn 是否切换了主题。

对话最近 5 轮：
{{history}}

规则：
- 只在 topic 明显不同（例如从"写代码"到"计划旅行"）时返 shift=true。
- 微调（例如同一个项目下换了子问题）→ shift=false。
- confidence < 0.7 时倾向于 no-shift（保守）。

输出 JSON：{ shift, confidence, oldTopic, newTopic, reason }。
```

## 成本估算

| 项 | 成本 |
|---|---|
| Backend 分类器 wire | 半天 |
| Prompt + zod schema | 半天 |
| Message banner UI + clone conversation flow | 1 天 |
| Cache logic + throttle | 半天 |
| QA + telemetry | 1 天 |
| 用户 opt-out setting | 半天 |

**总计**：3-4 天。

## 成本管控

- 每 conversation 每 15 min 最多 1 次判定；
- 用户可在 Settings → Chat → Auto-split 关掉；
- 默认对 conversation length ≤ 10 turns 不启用（未累积到判定价值）。

## 依赖 / 阻塞

- 消息 branching 落地后再启用会更好（split 出的新 conv 可以标 `parent_conversation_id`）。
- 需要 fast-tier profile（用户没配 → 静默禁用，不弹 error）。

## 决策

- **必要性**：**中**。长对话用户会感激；短对话用户看不到。
- **优先级**：Wave 5 后（LLM budget infra 就位后）。
- **依赖**：Message branching 决定后（R2）。

## Next steps

1. Wait for R2 决定
2. Prompt PoC + accuracy 手工评估（20 对话样本）
3. Backend wire + banner UI
4. Beta flag → release
