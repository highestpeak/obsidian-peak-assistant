# Vault Search 排序：第一性原理拆解

**日期**：2026-07-07
**范围**：Vault Search（`src/service/search/query/*`），不涉及 AI Analysis 侧的搜索
**产出**：一份关于"我们的 vault 搜索排序算法为什么歪、该怎么改、以及为什么不采用大厂做法"的思考路径完整记录
**结论一句话**：**先把排序变得能看清楚（诊断层），再决定要不要改算法**——不要基于一张截图设计一堆改动

---

## 1. 起因：三个具体的 bad case

用户搜索 CJK query `英语练习`，得到的第一屏：

| 排名 | 文档 | 分数 | 用户直觉判断 |
|---|---|---|---|
| 1 | `D-26年找工作/0-Index.md`（26 年找工作索引页） | 63% | ❌ 跟英语练习没关系，就是常打开（open_count=56） |
| 2 | `英语练习记录/2026-06-04-behavioral-b0e848.md` | 42% | ⚠️ 一头雾水。title 完全无关，snippet 无高亮，看不出为什么 |
| 3 | `每日任务/2026-06/0603-daily-tasks.md`（内容有 `## 英语练习`） | 38% | ✅ 相关。**但这才应该排第一** |
| 4 | `E-日记/mess/docs-表格中的Deltas和Mask插槽机制.md` | 37% | ❌ 完全无关，就一个"练习"字凑数 |

**核心用户抱怨**：
1. 高频打开的文档一直挤到最前面
2. 搜索结果里出现明显无关的文档，看不出为什么在这里
3. 真正相关的日报被推到第三、第五名

---

## 2. 学术界 + 产业界的调研

### 2.1 个人 KB 搜索的本质：Re-finding，不是 Discovery

**关键论据来自 20 年前的 PIM（Personal Information Management）研究**：

- **Dumais et al., "Stuff I've Seen" (SIGIR 2003, Test-of-Time Award 2015)** — 提出 PKB 搜索场景下用户是在**重新找回**已知存在的东西，与 web search 的 discovery 场景本质不同。设计决策是把 **filter（日期、类型、作者）作为一等公民**，因为纯 ranking 单独 underperforms。[论文](https://cutrell.org/papers/SISCore-SIGIR2003.pdf)

- **Teevan, "Supporting Finding and Re-Finding Through Personalization" (MIT PhD Thesis 2007)** — 明确论证 PIM 查询的主要任务是 **re-finding**（用户知道文档存在于自己的语料库里，只是记不清在哪），与 Broder 2002 分类下的 informational query 是不同任务。[论文](http://teevan.org/publications/theses/doctoralthesis.pdf)

- **Broder, "A Taxonomy of Web Search" (SIGIR Forum 2002)** — 定义了 Navigational / Informational / Transactional 三分类。Web 是 80% informational / 10% navigational。**PKB 场景几乎完全反过来**（Teevan 数据），大部分 query 是 navigational/re-finding。[论文](https://sigir.org/files/forum/F2002/broder.pdf)

### 2.2 产业界的做法（Notion / Slack / Obsidian）

- **Notion, "Two years of vector search at Notion" (Feb 2026)** — hybrid BM25 + turbopuffer 向量库 + cross-encoder rerank，xxHash-based 增量 re-embed。**没有公开的 ranking 权重**。[博客](https://www.notion.com/blog/two-years-of-vector-search-at-notion)

- **Slack, "What is Personalized Search"** — 明确原则：**Personalization 只在 top-K 里重排，不会把不相关的文档拉进来**。相关性是主，个性化是辅。[博客](https://slack.com/blog/productivity/what-is-personalized-search-and-how-does-it-work)

- **Obsidian Quick Switcher** — 不开源，社区观察：**纯 filename fuzzy match，10k+ 文件后算法降级**，不搞复杂 personalization。Filename first。[论坛](https://forum.obsidian.md/t/options-to-control-the-quick-switcher-algorithm-above-10-000-files/56861)

- **Roam / Logseq / Tana / Heptabase / mem.ai** — **完全没有公开发表 ranking 逻辑**。marketing 声称 "best-in-class personal search"，但技术细节空白。这是行业的一个信息 gap。

### 2.3 加法 boost 是行业公认的 anti-pattern

- **Elastic 官方博客 "BM25 ranking with multiplicative boosts"** — 直接批判加法结构：不同信号量纲不同，一个大 boost 就能吃掉所有其他信号。推荐 `function_score` 的 `multiply`。[博客](https://www.elastic.co/search-labs/blog/bm25-ranking-multiplicative-boosting-elasticsearch)

- **Doug Turnbull 的 gist "Additive vs Multiplicative Boosting"** — 搜索业界经典参考，同样结论。[gist](https://gist.github.com/softwaredoug/2ffe98e30d75e5d766b7)

### 2.4 BM25F 与 field-weighted 检索

- **OpenSource Connections "Better term-centric scoring with combined_fields"** — Lucene 8.9+ 的 `CombinedFieldsQuery`（ES `combined_fields`）是正确的 BM25F 实现，胜过"各字段独立 BM25 后加权求和"。典型权重：`title:2.0, body:1.0, tags:1.5`。[博客](https://opensourceconnections.com/blog/2021/06/30/better-term-centric-scoring-in-elasticsearch-with-bm25f-and-the-combined_fields-query/)

### 2.5 Hybrid gating（vector + keyword 融合的 keyword 门槛）

- **Weaviate "Hybrid Search Explained"** — vector recall 的结果若无 keyword 命中，会污染 top-K。行业主流做法是"keyword-first hybrid"：query 有关键词时，vector 结果必须有 sparse 命中才保留。[博客](https://weaviate.io/blog/hybrid-search-explained)

### 2.6 LLM rerank

- **"How Good are LLM-based Rerankers?" (arXiv 2508.16757, 2025)** — zero-shot LLM rerank 现在在 out-of-domain BEIR 上与 fine-tuned LTR 相当或更优，但 in-domain 有标注数据时 LambdaMART 仍胜出 ~16% NDCG@10。**PKB 永远拿不到标注数据 → LLM rerank 是理想替代品**。[论文](https://arxiv.org/html/2508.16757v1)

### 2.7 搜索质量与用户信任

- **Schultheiß & Lewandowski, "Misplaced Trust?" (2023)** — 用户默认信任 rank 顺序；**一个无理由的高排名错答案会毒害整个列表的可信度**。对 re-finding query 尤其严重。[论文](https://arxiv.org/pdf/2101.09159)

---

## 3. 我们当前算法的诊断

### 3.1 现状（改动前）

```
finalScore = base（rrf 融合 fts/meta/fuzzy 三路召回，值 0.01-0.05）
           + log1p(open_count) × 0.10           频次
           + max(0, 0.2 - days×0.005)           最近打开
           + 0.2 if 跟当前打开文件有引用关系    图邻近
           + hub anchor / hub_doc boost
           + 0.15 if 本会话点过
           + titleHitRatio × 0.60               ← 我加的
           + folderHitRatio × 0.15              ← 我加的
           + contentHitRatio × 0.25             ← 我加的
```

### 3.2 三个结构性病灶

对照上面调研的三条铁律：

**病灶 A：Personalization 主导 relevance（违反 Slack 铁律）**

- `0-Index` open_count=56 → freqBoost = log(57) × 0.10 = **0.40**
- 就这一个信号，直接压过所有 title/content 命中信号
- 结果：常打开的文档永远排第一，不管 query 是什么
- 违反行业共识："Personalization 只在 top-K 里重排，不能把不相关的拉进来"

**病灶 B：纯加法结构，量纲严重不一致（违反 Elastic anti-pattern）**

- base 尺度 0.01–0.05
- boost 尺度 0–0.6 绝对值
- base 完全被 boost 淹没，实际排序主要看 boost 绝对大小
- Elastic/Doug Turnbull 都明确批判过这种模式

**病灶 C：无 relevance floor（违反 hybrid gating 共识）**

- `docs-表格中的Deltas和Mask插槽机制` title/folder/content 全无命中
- 纯靠 vector retriever 的语义相似度进入 top-K
- 用户输入了明确 keyword 却看到 keyword 无命中的结果，信任崩塌

### 3.3 补充：CJK 场景的额外坑（已在早期修复）

- Query "英语练习" 因为 CJK 无空格，parser 当成一个整 token
- FTS index 时 `normalizeTextForFts()` 又把每个字塞空格
- 结果："英语练习"整串在打散后的"英语 需要 练习"里找不到
- **修法**：`expandQueryTokens()` 把 CJK term 自动切子 token，highlight 侧也同步（见 `docs/12-feature-search.html` bad case 表格）

---

## 4. 方案矩阵：所有讨论过的路径 + 取舍

按讨论顺序列出所有选项。每项标注**做/不做/为什么**。

### 4.1 BM25F（field-weighted BM25）

**做法**：把 title / folder / content 当独立字段，每个字段独立 tf / length norm / IDF，加权融合。行业标准（Elasticsearch `combined_fields`）。

**为什么不做**：
- BM25/IDF 是给"多作者、多风格、多主题"的大 corpus 设计的。个人 vault 是单一作者，vocab 高度重复，IDF 作为"重要性信号"意义严重削弱
- 需要在索引侧改动（预存 field length），实施成本高
- 相当于"用大炮打蚊子"

### 4.2 LLM rerank（Claude/GPT 重排 top-20）

**做法**：召回后取前 20 个候选，给 LLM 让它按 query 排序。学术界 2025 论文证明在无标注数据场景下打败 LTR。

**为什么不做（现在）**：
- 每次搜索 500ms 延迟。"先出一个排序，1s 后被替换"的 UX 撕裂
- 需要 Provider 配置，offline 不可用
- 只解决 rerank，不解决召回问题——前面还是要有一套 pipeline
- 未来可以做，但不是**现在**该做的第一件事

### 4.3 Query 意图分流（Navigational vs Informational）

**做法**：短 query（≤2 CJK token）+ filename fuzzy 有命中 → 走 Quick Switcher-style filename match，跳过 hybrid pipeline；否则走完整 pipeline。

**为什么不做**：
- 用户不知道自己触发了哪种模式。"上次搜这个不是这样啊" → 崩塌
- 引入的不可预测性 > 解决的问题
- 需要清晰的 UI 提示，成本大

### 4.4 反向 Personalization（常打开的降权）

**做法**：把 freqBoost 系数变负号——常打开的文档反而降分，因为用户知道它在哪，搜索是为了帮回忆"忘了的"。

**为什么不做**：
- **学术界从没验证过**。subagent 调研明确说 "No direct evidence for or against, this is a genuine gap"
- 推理链有漏洞：re-finding ≠ "找忘了的"。用户搜"英语练习"可能就是想找**昨天刚记的那份**（最常打开的），反向反而毁体验
- 是"看似有洞察的猜想"，不是有证据的最佳实践

### 4.5 命中原因 Badge

**做法**：每个 result 加小标签，`title 命中` / `folder 命中` / `内容 × N`，让用户看出为什么这条在这里。

**为什么先不做**：
- 大部分文档都会命中 title/folder/content 至少一处，badge 会满屏都是，变**视觉噪音**
- 一个 doc 同时命中多处，显示哪个？规则怎么定？
- Badge 只能表达"命中什么"，无法解释完整排序（freq / recency / graph 都参与）
- 要做得认真设计（选择显示逻辑、config 化文案），不是"随手加一个"
- 用户真正想看到的可能是**完整的评分组成**（诊断层能给），不是简化的标签

### 4.6 Keyword Gate（无命中直接过滤）

**做法**：query 里有关键词时，doc 必须至少 title/folder/content 命中一个 token 才能进 top-K。命中失败的直接过滤，不管 vector 分多高。

**为什么先不做**：
- 会杀死 vector 召回的价值——用户搜"英语练习"，可能想要"雅思写作练习"、"口语 mess"这种语义相关但没直接命中的
- 更妥的做法是**vector-only 结果降权**（× 0.4）而不是硬 gate。但这又回到"调权重"路径
- 需要先看真实数据里 vector 噪音到底占多大比例，再决定

### 4.7 降 freq/recency 权重

**做法**：`freqBoost: 0.10 → 0.02`，`recencyBoost: 0.20 → 0.05`。

**为什么先不做**：
- **只是止痛**。base 是 0.005-0.03 尺度，freqBoost 降到 0.08 依然主导 base——量纲不一致的结构问题一动没动
- 治标不治本
- **但是**：这是三个方案里风险最低、效果最直接的一个。**如果只做一件算法层修改，就应该做这个**

### 4.8 归一化 base（min-max 到 [0, 1]）

**做法**：候选集内 min-max 归一化 base score，让 base 和 boost 量纲一致。

**为什么先不做**：
- 只对当前候选集归一化，不同 query 之间分数依然不可比（63% 不是绝对相关性）
- 需要重新校准所有 boost 系数
- 属于结构改动，风险中等

---

## 5. 最终结论：只做两件事

**核心哲学**：现在连排序的每一项是怎么组成的都没记录（debug trace 里我加的 boost 一个都没写进去）。这种情况下动任何权重都是**盲调**，改坏了都不知道为什么。**先看清楚，再改。**

### 5.1 要做的两件事

#### A. 让排序变得能看清楚（诊断层）

**范围**：`src/service/search/query/queryService.ts`、`src/service/search/debugTraceAdapter.ts`

**改动**：
1. 在 boost span 里补记每条 result 的：
   - `titleHitRatio` / `folderHitRatio` / `contentHitRatio`（原始比例值）
   - 每一项 boost 的绝对贡献值（`freqBoost = 0.08`, `folderBoost = 0.15`...）
   - 最终 finalScore = base + Σ(每一项 boost)
2. 让开发者打开 debug trace 能一眼看清"63% 是 base 5% + freq 40% + folder 15% + content 3% 组成的"

**收益**：所有后续决策的前提。没有诊断能力，动权重都是赌博。

#### B. UI 暗示 filter 语法

**范围**：`src/ui/view/quick-search/`（搜索输入框、空状态、结果过多提示）

**改动**：
1. Vault Search 已经支持的 `folder:` `file:` `path:` `tag:` 等 syntax，在 UI 上明确暗示
2. 空 query 状态：`试试 folder:英语练习 或 file:0603 精准定位`
3. 结果过多（≥ 30）时：`加 file: 或 folder: 缩小范围`

**收益**：让用户从"依赖排序猜对"过渡到"用 filter 主动约束"，是 Dumais SIS 20 年前论证的核心结论——**光靠 ranking 单独 underperforms**，必须把 filter 做成一等公民。

### 5.2 明确暂不做的（配套解释）

| 暂不做 | 什么时候可能做 |
|---|---|
| BM25F | 短期不做。规模到 100k+ docs 且 IDF 意义回归时再考虑 |
| LLM rerank | 未来做。等诊断层跑一段、明确基础 pipeline 稳定后，作为可选增强 |
| 意图分流 | 除非有清晰的 UI 提示方案，否则不做 |
| 反向 personalization | 除非有实验数据支持，否则不做 |
| 命中 badge | 需要专门的视觉/交互设计任务再做 |
| Keyword gate | 观察一周后如果 vector 噪音确实是主要问题，做 vector-only 降权而不是硬 gate |
| 降 freq/recency 权重 | 观察诊断层数据后决定。如果确认 personalization 是主要问题源，可以做——但只是止痛 |

### 5.3 UX/信任层的最重要提醒

**Schultheiß 2023 的研究结论**：**一个无理由的高排名错答案会毒害整个 list 的可信度**。对 re-finding query 尤其严重（用户"知道答案存在"，一个假冒者会激发不信任）。

这意味着：**排序不完美不是最伤的，排序不可解释才最伤**。所以诊断层 + filter 语法暗示的组合，可能比任何算法微调都更能提升用户体感。

---

## 6. 观察窗口 & 下一步决策

### 6.1 做完 A + B 后观察一周

拿真实的使用数据看：
- Debug trace 里排序组成的分布：哪些 boost 项贡献最大？
- 用户搜什么样的 query？（长度、语言、关键词密度）
- 排序不合理的具体 pattern：是 personalization 主导，还是 vector 噪音，还是 folder-only 主导，还是别的？
- Filter 语法有没有用起来？

### 6.2 基于观察决定下一步

按可能性从大到小：
1. **如果 personalization 主导确认是主要问题** → 降 freq/recency 权重（方案 4.7）
2. **如果 vector 噪音是主要问题** → vector-only 结果降权（方案 4.6 的软版）
3. **如果分数量纲不一致导致 boost 不稳定** → 归一化 base（方案 4.8）
4. **如果基础 pipeline OK 但排序质量还有提升空间** → 加 LLM rerank（方案 4.2）

### 6.3 什么情况下要回来重看这份文档

- 走到某一步发现方向不对
- 观察数据颠覆了这份文档的某个假设
- 有新的调研证据（比如 Notion 又发博客了、有新 PKB search paper）
- 大改动之前（BM25F / LLM rerank 落地前）

---

## 7. 参考文献

### 学术论文
- Dumais et al. — "Stuff I've Seen" — SIGIR 2003 (Test-of-Time 2015): https://cutrell.org/papers/SISCore-SIGIR2003.pdf
- Teevan — "Supporting Finding and Re-Finding Through Personalization" — MIT PhD 2007: http://teevan.org/publications/theses/doctoralthesis.pdf
- Broder — "A Taxonomy of Web Search" — SIGIR Forum 2002: https://sigir.org/files/forum/F2002/broder.pdf
- Schultheiß & Lewandowski — "Misplaced Trust?" — 2023: https://arxiv.org/pdf/2101.09159
- "How Good are LLM-based Rerankers?" — arXiv 2508.16757, 2025: https://arxiv.org/html/2508.16757v1
- "Zero-Shot Reranking with Precomputed Features" — SIGIR 2025: https://dl.acm.org/doi/10.1145/3726302.3730119

### 产业博客
- Notion — "Two years of vector search at Notion" — Feb 2026: https://www.notion.com/blog/two-years-of-vector-search-at-notion
- Slack — "What is Personalized Search": https://slack.com/blog/productivity/what-is-personalized-search-and-how-does-it-work
- Elastic — "BM25 ranking with multiplicative boosts": https://www.elastic.co/search-labs/blog/bm25-ranking-multiplicative-boosting-elasticsearch
- OpenSource Connections — BM25F / combined_fields: https://opensourceconnections.com/blog/2021/06/30/better-term-centric-scoring-in-elasticsearch-with-bm25f-and-the-combined_fields-query/
- Weaviate — "Hybrid Search Explained": https://weaviate.io/blog/hybrid-search-explained
- Doug Turnbull — "Additive vs Multiplicative Boosting": https://gist.github.com/softwaredoug/2ffe98e30d75e5d766b7
- Notion ML ranking teardown (Qwak): https://www.qwak.com/academy/notions-search-ranking-ml-model-explained

### 社区
- Obsidian forum — Quick Switcher algorithm above 10k files: https://forum.obsidian.md/t/options-to-control-the-quick-switcher-algorithm-above-10-000-files/56861
- SQLite FTS5 CJK bigram fix: https://dev.to/foxck016077/sqlite-fts5-wont-tokenize-chinese-heres-the-7-line-bigram-fix-that-did-4fcc

---

## 8. 记录：这份文档诞生的思考轨迹

（保留下来，避免下次再犯同样的错）

**第一轮**：套 ES / Google / Slack 的做法，推 BM25F + gate + 加法 anti-pattern。**教科书正确，但没质疑"大厂做法是否适合个人 KB"这个假设**。

**第二轮**：转向"反常识"，推 LLM rerank + 意图分流 + 反向 personalization。**包装成"洞察"，但很多是没验证的猜想**。

**第三轮反思**：承认前两轮过度，缩到 badge + gate + 降权重三件事。**方向对，但每件都有隐藏 trade-off 没说清**。

**第四轮再看**：发现三件事各有代价——badge 会变视觉噪音、gate 会杀 vector 价值、降权重只是止痛。**开始转向"可能问题不在算法本身"**。

**最终收敛**：一直在算法层转圈，但用户 pain point 是"看不懂为什么"——是可解释性问题。**做诊断层 + filter 语法暗示，避免盲改算法**。

**教训**：不能根据一张截图设计一堆改动。**先看清楚，再改**。
