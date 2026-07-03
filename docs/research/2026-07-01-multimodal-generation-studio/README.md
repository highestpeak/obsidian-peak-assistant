# 多模态生成能力调研：Image / Video / Music / Voice 与 Obsidian Studio 形态

- **日期**：2026-07-01
- **状态**：**已实施骨架**（2026-07-03 commit `459aa5ba`，见下方 §实施记录）
- **类型**：产品方向调研（学术 + 产业 + 竞品 + 第一性原理 + 集成架构）
- **姊妹调研**：`docs/research/2026-07-01-rich-generation-in-chat/`（Mermaid/Bases/Excalidraw/Dataview 富生成）——本报告在其之上补齐"重度媒体生成"这一层
- **候选功能索引**：见 `docs/index.html` → "潜在功能与调研索引"

## 实施记录（2026-07-03）

Backlog D4 Multimodal Media Ring 已落地骨架，本节记录**方案选择的对应实现**，方便后来者对齐：

### 架构选择：Port + Adapter（对应报告 §骨干选择）

| 报告结论 | 落地方式 |
|---|---|
| "不要为每个 provider 写 adapter，沿用已有 provider 抽象套一层聚合器" | 抽象层：`src/core/ports/MediaGenerationPort.ts` — 三方法 (`generate` / `isConfigured`)，输入 `MediaGenerationRequest { kind, prompt, styleHint, negativePrompt, aspectRatio }`，输出 `MediaGenerationResult { bytes, extension, mimeType, modelId, latencyMs }`。**换 provider 只需实现一个新 adapter，orchestration 层零改动。** |
| "主推 fal.ai，Replicate 做备胎" | 具体 adapter：`src/app/platform/media/FalMediaAdapter.ts`（唯一一个 shipped）。fal.ai queue.fal.run 提交-轮询模式，指数退避 1.5s → 5s，超时 5min。Replicate 备胎位置留给未来 `ReplicateMediaAdapter`。 |
| "TTS + 封面图必做，视频界面暂不暴露" | 命令：`peak-media-tts-active-note` + `peak-media-cover-active-note`。视频只在 `FalMediaAdapter.defaultModelFor('video')` 里留了默认 model id (`fal-ai/veo3/text-to-video`)，没接命令 UI。 |
| "产物必须落 vault + 附件生命周期" | 写回：`ObsidianMediaAttachmentWriter` — 默认目录 `_attachments/media/`（可 override），带时间戳冲突后缀，`createBinary`。 |
| "成本必须显性化" | 尚未实施：`FalMediaAdapter.generate` 返回 `latencyMs` 但没记 cost。属于后续 Usage Dashboard 挂接。 |

### 具体 model 选择

`FalMediaAdapter` 默认值（都可以 `styleHint = "model:..."` override）：

- **TTS**：`fal-ai/kokoro/american-english`（开源 Kokoro，声音自然、成本极低——`voice: af_bella` 默认）
- **图像**：`fal-ai/fast-sdxl`（比 Flux 便宜 3-5×，够用于笔记封面；未来若用户抱怨质量再上 Flux）
- **视频**：`fal-ai/veo3/text-to-video`（占位，未接命令）

### 设置 shape

`AIServiceSettings` 新增两字段：

```ts
falApiKey?: string;          // 用户去 fal.ai 拿 key 填这里
mediaAttachmentFolder?: string; // 默认 '_attachments/media'
```

### 缺口 / follow-up

以下功能报告里点了，但**没实施**（诚实标记）：

1. **NotebookLM 风格笔记播客**——需要双人 TTS 编排 + 对话脚本生成，不是单 `generate` 调用，需要新 orchestrator 层
2. **Chat 内插图**——需要挂到 chat 消息流（同 D3.mermaid 的位置），会用同一个 `MediaGenerationPort`
3. **Project style token**（每个项目一致的视觉风格）——需要设置层 + prompt 组装策略
4. **Cost tracking**——Usage Dashboard 联动
5. **`ReplicateMediaAdapter`**——备胎位，没写
6. **音乐**——报告直接说 "放弃"，本次也没做

要接入以上任一项：写新 orchestrator / 命令即可，`MediaGenerationPort` 层无需改动。

---


## TL;DR

**必要性：中高，但优先级排在 Mermaid/Bases 之后。**

- **不要做 Krea 克隆**。Obsidian 用户不是设计师，是知识工作者——多模态生成对他们是**"笔记的伴生物"**（封面、音频版、图解、视频摘要），不是最终产品。
- **形态：不是 Studio,是"媒体工具环"（media tool ring）**——挂在 chat/copilot/note 上的一圈能力，需要时召唤，不需要时看不见。真正上升到独立 Studio 视图,要等 3+ 工具都成熟且用户明确要求"批量处理"时。
- **集成骨干押注 fal.ai**（image API 市场占有率 50%,video 44%,985 个 endpoints,比 Replicate 便宜 30–50%）。**不要为每个 provider 写 adapter**——沿用已有 provider 抽象套一层 fal.ai/Replicate 聚合器就够。
- **必做序列（按 ROI）**:TTS(极便宜、极实用、许可干净) → 笔记封面图 → NotebookLM 风格的笔记播客 → chat 内插图。视频和音乐**先放弃**,等 fal.ai 之类的价格再跌一档、或有明确用户信号再做。
- **护城河**:同上一份调研——**vault-aware**。封面图理解笔记的语义主题和邻居笔记风格,podcast 会引用 vault 里的相关笔记,插图有 project 级 style token 保持一致。竞品做的是"文生图/视频",我们做的是"vault 生媒体"。

---

## 一、第一性原理:Obsidian 用户到底需要多模态生成来做什么

用户开 Obsidian 不是为了做视频、不是为了发 Instagram。核心是**思考的外化**。多模态生成对他们的价值有且仅有四类:

| 类别 | 具体形态 | 价值层级 |
|---|---|---|
| **降低认知成本** | 图解、封面、示意图 | 强(和上一份 diagram 调研同源) |
| **换感官通道** | TTS 听笔记、播客对话版 | 中(通勤/走路场景刚需) |
| **视觉记忆锚点** | 每篇笔记一张封面图,月度归档、pubish 时用 | 中(美感 + 可搜性) |
| **总结与推销** | 视频/音频摘要,分享给他人 | 弱-中(小众高价值场景) |

**不需要**:MV 级视频、专辑级音乐、商用素材库。这些用户会直接开 Midjourney/Suno,不指望在 Obsidian 里做。

三条不可动摇的约束(和上份调研一致):
1. **产物必须落到 vault 里**——`.mp3`/`.mp4`/`.png`/`.webp` 是文件,不是 chat 里的临时预览。
2. **生成要有 vault 上下文**——凭空文生图不如别做,竞品海了去。
3. **成本必须显性化**——用户不能一次点击花 22 美元(Sora 30s = $22.50)而不知情。

---

## 二、学术界:Multimodal RAG 是关键理论支柱

2025 年 2 月 arXiv *Ask in Any Modality: A Comprehensive Survey on Multimodal Retrieval-Augmented Generation* 是这一年多模态 RAG 的定调之作。三个对我们有直接影响的结论:

1. **mRAG 把"生成"和"检索"跨模态打通**——生成一张图之前先从知识库检索相关图/文本作为条件,输出质量显著提升。**对我们意味着**:生成笔记封面前,应该先用 SearchClient 拉相关笔记 + 相关已有附件作为 reference,不是裸 prompt。
2. **VideoRAG(2501.05874)、Multi-RAG(2505.23990)**——把"检索"扩展到长视频、多流。**对我们意味着**:未来"从 vault 生成视频摘要"是有理论支撑的,但优先级放到最后。
3. **安全警告**——mRAG 系统对 knowledge poisoning 极其脆弱,**5 个 image-text pair 注入就能达到 98% 攻击成功率**(BayesRAG 论文)。用户的 vault 是 trusted,但如果我们从公共图库或网页拉参考图,必须有防护。

心法一句话:**"生成即检索 + 检索即条件"**——不要允许"零上下文生成媒体"作为默认。

---

## 三、产业界:2026 生成能力全景(按模态)

### 图像

| 模型 | 强项 | 单价 | 场景 |
|---|---|---|---|
| **Flux 2**(Schnell/Dev/Pro) | 写实、皮肤/光照最强 | $0.015 / $0.025 / $0.05 | 通用主力 |
| **GPT-image 2** | 指令跟随强、编辑能力 | 中高 | 复杂编辑 |
| **Nano Banana(Gemini)** | 极快、便宜 | 低 | 缩略图/占位 |
| **Ideogram 3.0** | **图内文字 90–95% 准确率**(vs Midjourney 30–40%) | $0.03–$0.09 | 封面/海报/带字设计 |
| **Recraft V4** | **唯一原生 SVG 输出** | $0.04 / $0.08(SVG) | Logo、图标、矢量图 |
| **Seedream** | 亚洲美学、快速 | 低 | 特定审美 |

**对 Obsidian 的启示**:三档就够——**Flux Schnell 做日常封面(1.5¢/张,批量便宜),Ideogram 做带字的月度归档/publish 封面,Recraft 生成矢量 icon**。其他不用暴露。

### 视频

| 模型 | 强项 | 单价 | 状态 |
|---|---|---|---|
| **Sora 2** | 声誉高 | **$0.75/秒**(30s = $22.5) | ⚠️ API **将于 2026-09-24 停用**,不要押注 |
| **Veo 3.1** | 4K + 最佳唇同步 + 音频 | $0.15/s(fast) / $0.75/s(std) | 质量王 |
| **Kling 3.0** | 价值 | **$0.10/s** | 高性价比 |
| **Runway Gen-4.5** | 编辑、订阅制 | $15–95/mo | 专业工作流 |
| **Seedance 2.0**(fal.ai) | 统一 A/V 架构、原生 physics | 低-中 | 后起之秀 |

**对 Obsidian 的启示**:**MVP 阶段不做视频生成**。理由:成本 3–20 美元/次,失败率高,笔记场景刚需度弱。留个 fal.ai adapter 接口位置,但界面不暴露。

### 音乐

| 平台 | 强项 | 商用许可 |
|---|---|---|
| **Suno v5** | 质量领先 | 2025 末与主流唱片公司达成和解,商用条款仍复杂 |
| **Udio** | 音乐人友好 | 同上 |
| **ElevenLabs Music** | **Day-1 clean commercial** | ✅ 商用最干净 |
| **Stable Audio** | 授权数据集训练 | ✅ 商用清晰 |
| **Google Lyria / MiniMax** | 有正式 API | 中 |

**对 Obsidian 的启示**:**音乐生成 = 最低优先级**。真要做,只做"laser focus 背景音乐"这一垂类,用 ElevenLabs Music 或 Stable Audio 保证许可干净。避开人声 + 歌曲。

### 语音(TTS/STT)

- **ElevenLabs**:主流选择,音色最像人,商用干净。
- **OpenAI TTS**:便宜、稳定、API 简单。
- **STT**:Whisper/gpt-4o-transcribe 已经是事实标准。

**对 Obsidian 的启示**:**TTS 是最低垂的果实**——单价约 $0.30/千字符,一篇 2000 字笔记 < 3¢。用户价值极高(通勤听笔记),许可干净,技术成本最低。

### 聚合器(基础设施押注)

- **fal.ai**:985 endpoints,image API 市场 50%、video 44%,比 Replicate 便宜 30–50%,速度快 10x
- **Replicate**:模型更广(200+ vs 600+ fal.ai 实际主力),社区自定义模型多
- **WaveSpeed / Novita / Runware**:后起,价格更激进但成熟度低

**建议**:**主推 fal.ai,Replicate 做备胎**。不要自己接每一家模型的 SDK。

---

## 四、Chatbot 竞品:UI 模式已经收敛

| 产品 | Image | Video | Music | 关键模式 |
|---|---|---|---|---|
| **ChatGPT** | ✅ gpt-image-2 inline,支持迭代编辑 | ✅ Sora tab | ❌ | inline generate + Canvas 精修 + "referenced image" 附件 |
| **Claude** | ❌(**空白!** 只能分析不能生成) | ❌ | ❌ | Artifacts 里能出 SVG/Mermaid,不算真图 |
| **Gemini** | ✅ Imagen 3 inline | ✅ Veo/Omni inline | ❌ | 最强的"同一对话内多模态" |
| **Grok** | ✅ Aurora | 有限 | ❌ | X 平台整合 |
| **Perplexity** | 弱 | ❌ | ❌ | 主打搜索 |

**关键观察 —— Claude 是唯一没有原生图像生成的头部产品**。这暗示两点:
1. 用户从 Claude 用户切过来的会**格外期待我们补齐**(参照上一份调研的 "3–6 个月内会显得落后一代")。
2. 但 Anthropic 的空白也说明:重度媒体生成**不是 chat 的核心心流**,是可选层。我们不需要 all-in。

**UI 模式已收敛的三个:**
- **Inline 生成 + 附件化**——图在气泡里,可点击放大、可"附加为参考图再改"。
- **迭代编辑**——"把这张改成夜晚"、"去掉左边的人"——需要 seed/reference 保留。
- **成本告示**——video 类必须有 "$0.30 · 生成"确认按钮,不然用户被账单教育一次就再不敢点。

---

## 五、Studio 产品对标(Krea/Freepik/Leonardo/Ideogram)

| 产品 | 模型数 | 亮点 | 对我们的启示 |
|---|---|---|---|
| **Krea** | 64+ 聚合(FLUX/Veo/Kling/Runway/Nano Banana/Ideogram) | **realtime canvas <50ms**,拖拽即出图 | 聚合是趋势,但 realtime canvas 需要 WebGPU 加速,不适合 Obsidian |
| **Leonardo** | 自家 + 编辑 + 训练 + 视频 | AI Canvas 做 in/outpainting | 编辑>生成的观念值得学 |
| **Ideogram Canvas** | 自家 | **图 + 排版一体化** | "带字的封面"是 Obsidian 用户刚需(标题卡),值得复用 Ideogram |
| **Freepik AI Studio** | 聚合 + 素材库 | 多工具一屏 | 工具环形态的对标 |
| **Morphed** | 15+ 模型聚合 | 免费额度 | Krea 平价替代 |

**Studio 形态的共性:一个 canvas + 多个 tool 按钮 + 模型选择 + reference 面板 + 历史条**。

**我们要不要做?现在不要。** 理由:
1. Obsidian 已有 workspace 概念,再塞一个 Studio 视图会抢屏。
2. 用户的锚点是**"这篇笔记要一张图"**、**"这篇要一个音频版"**——**是笔记发起的,不是 canvas 发起的**。工具环挂在笔记上更符合心流。
3. 独立 Studio 视图是"3+ 工具稳定后的合并入口",不是起点。

---

## 六、Obsidian 生态盘点

| 插件 | 做了什么 | 缺口 |
|---|---|---|
| **AI Assistant** | DALL-E 2/3 图像 + STT + chat | 无视频、无音乐、无 vault 感知、模型选择弱 |
| **Aloud** | OpenAI TTS 朗读高亮文本 | 单一 provider,无 podcast 对话 |
| **Text to Speech** | 基础 TTS | 同上 |
| **Audio Brief** | 笔记 → AI 对话式播客(NotebookLM 风格) | 独立插件,与 chat/vault graph 割裂 |
| **n8n workflow: notes → podcast RSS** | 自动化路径 | 需要 n8n,门槛高 |
| **Copilot / Smart Composer / Infio** | chat 主流 | **零多模态生成** |

**明确的空缺:**
1. 没有一个插件把"vault-aware 图像生成 + 音频 + 播客 + 视频"聚在一个 chat/copilot 底座下。
2. 现有插件几乎都是 "OpenAI 一家"——**没有 fal.ai 聚合、没有 provider 选择、没有成本可视**。
3. Audio Brief 证明"笔记 → 对话式播客"有真实用户需求,但它是孤岛,没有和 chat 上下文/相关笔记连接。

**这就是我们的机会窗**。

---

## 七、集成架构建议(核心决策)

### 骨干:fal.ai 聚合器 + 我们已有的 provider 抽象

```
User request
   │
   ▼
[MediaGenerationService]                ← 新增, service/media/
   │
   ├── image  → fal.ai adapter → Flux / Ideogram / Recraft / Nano-Banana
   ├── video  → fal.ai adapter → Veo / Kling / Seedance          (defer)
   ├── music  → ElevenLabs / Stable Audio adapter                (defer)
   ├── tts    → ElevenLabs / OpenAI adapter                      ← 先做
   └── stt    → OpenAI whisper adapter                            (已经能用)
   │
   ▼
[MediaJobRunner] (async queue, cost gate, retry)
   │
   ▼
[Vault Storage] .png/.mp3/.mp4 → configured attachment folder
   │
   ▼
[Chat / Note / Copilot 三个入口消费]
```

**关键设计原则:**

1. **async job queue**:视频/音乐需要 30s–5min,必须是任务而不是同步调用。跟 chat streaming 分开。UI 上以"正在生成: 剩 45s"或后台通知呈现。
2. **cost gate**:所有 >$0.10 的单次调用必须弹出确认("Veo 3.1 · 5s · $0.75 · 生成"),可在 settings 里为"信任模型"关闭。
3. **vault-aware prompt builder**:所有生成前跑一次"上下文补全"——当前笔记摘要 + 相关笔记 hub + project style token → 拼成 augmented prompt。
4. **project style token**:每个 project 一个视觉/音频风格 tag(存在 project 元数据),保证同一项目产物视觉一致。这是**唯一竞品做不到的差异化**。
5. **附件落盘策略**:遵循 Obsidian 的 attachment folder 设置,文件名 `<note-slug>-<kind>-<yyyymmdd>-<hash>.<ext>`。
6. **MCP-ready**:media generation 也导出为 MCP tool,让 agent loop 能自主调用("我需要一张图解释这段" → agent 主动 call)。

### 三个入口

- **Chat 内 inline**:用户在 chat 说"给这个概念画张图"→ 结果在气泡里预览,"插入到笔记"按钮。
- **Note 侧栏"Media"面板**:一个笔记打开后,侧栏有"封面"/"音频版"/"播客对话"/"图解"四个按钮,一键生成并挂到笔记 frontmatter。这才是**心流最贴合**的入口。
- **Command palette**:"Generate cover for current note" / "Play as podcast"——键盘用户友好。

### 什么时候升格为 Studio 视图

**三个门槛都过了再做**:(a) image + tts + podcast + illustration 4 类工具稳定;(b) 用户明确反馈"我要批量给一个 project 30 篇笔记生成封面";(c) 我们能挤出至少一个 view slot 不冲突。

在此之前,**Studio 是个反模式**——增加 workspace 混乱、降低发现性、拖延正事。

---

## 八、心流与成本(容易翻车的四个点)

1. **等待期心流:**
   - 图 3–8s → 用 skeleton + 骨架进度条
   - TTS 5–15s → 流式返回,先播先渲染
   - 视频 30s–5min → **绝对必须 async**,通知式回来。做不了流式就别塞进 chat,做一个"任务面板"
   - 音乐 30–90s → 同上
2. **失败降级:** fal.ai queue 满 / rate limit → 自动 fallback 到 Replicate;prompt 违反 policy → 前置检测,不要让用户等 30s 再看到 error。
3. **成本教育:** 首次进入 media 功能时用一个 modal 告诉用户"图 = 一杯咖啡的 1/500,视频 = 一杯咖啡的 1/2",不做数字文盲。
4. **附件泛滥:** 每篇笔记 3 张图 + 2 个音频,vault 会爆。**必须**在 settings 里给"自动清理 N 天未引用生成物"的选项。

---

## 九、必要性判断 & 分波路线

**必要性:中高。** 单看每一项都不是刚需,但组合起来是"Obsidian AI 插件是否'现代'"的重要信号。**Claude 至今没原生图像生成**——市场空白很大,但这也意味着不是生死线。

### 建议路线(决策排序,非实施承诺)

| Wave | 内容 | 投入 | 理由 |
|---|---|---|---|
| **A.先做** | **TTS 朗读笔记 + 笔记聚合播客**(NotebookLM 风格) | 1–2 周 | 单价极低、许可干净、通勤刚需、竞品 Aloud/Audio Brief 已证明需求 |
| **B.紧跟** | **笔记封面图**(Flux Schnell 主力 + Ideogram 带字变体) | 2 周 | 每笔记一张,视觉记忆锚点,cost 可控,vault-aware 差异化最明显 |
| **C.随后** | **Chat 内 inline 图解**(参照 ChatGPT 模式) | 2–3 周 | 补齐 Claude 空白,现代化信号 |
| **D.可选** | **视频摘要**(Veo fast / Kling) | 3–4 周 | 成本高、失败率高,只在明确用户请求后做 |
| **E.放弃** | **音乐生成** | — | 用户群基本无需求,ElevenLabs Music 独立用即可 |
| **F.最后再谈** | **Studio 视图统合** | — | Wave A–C 稳定后再评估,不要提前 |

### 押注的护城河

**vault-aware + project style token + 附件生命周期管理**。三者叠加,竞品要么做不到(它们没有 vault graph),要么不会做(它们不管 vault 卫生)。这是我们做重度媒体生成**唯一值得做**的理由——否则用户直接开 fal.ai/Krea 就好,不需要 Obsidian 插件。

---

## Sources

### 模型与 API 对比

- [Best AI Image Models 2026: FLUX / GPT Image 2 / Seedream / Ideogram / Imagen 4 / Recraft (Melies)](https://melies.co/compare/ai-image-models)
- [Flux vs Ideogram vs Recraft: Image Generation APIs 2026 (APIScout)](https://apiscout.dev/guides/flux-vs-ideogram-vs-recraft-image-gen-api-2026)
- [AI Video Generation 2026: Sora 2 vs Veo 3.1 vs Kling 3.0 (Lushbinary)](https://lushbinary.com/blog/ai-video-generation-sora-veo-kling-seedance-comparison/)
- [AI Video Generation API Pricing May 2026 (Crazyrouter)](https://crazyrouter.com/en/blog/ai-video-generation-api-pricing-may-2026-comparison)
- [AI Music Generation 2026: Suno, Udio, ElevenLabs Compared (Digital Applied)](https://www.digitalapplied.com/blog/ai-music-generation-platforms-suno-udio-elevenlabs-2026)
- [Suno vs Udio vs ElevenLabs Music 2026 (AI Magicx)](https://www.aimagicx.com/blog/suno-vs-udio-vs-elevenlabs-music-comparison-2026)
- [ElevenLabs Launches AI Music App ElevenMusic](https://mlq.ai/news/elevenlabs-launches-ai-music-app-elevenmusic-for-song-creation-and-remixing/)

### 聚合器与基础设施

- [fal.ai homepage & model catalog](https://fal.ai/)
- [FAL.AI vs Replicate 2026 (TeamDay)](https://www.teamday.ai/blog/fal-ai-vs-replicate-comparison)
- [Best AI Inference Platform 2026 (WaveSpeed)](https://wavespeed.ai/blog/posts/best-ai-inference-platform-2026/)
- [Seedance 2.0 API on fal.ai](https://fal.ai/seedance-2.0)

### Studio 产品

- [Krea AI Review 2026 (ThePlanetTools)](https://theplanettools.ai/tools/krea-ai)
- [Krea AI Review 2026 (AIUnpacking)](https://aiunpacking.com/review/krea-ai/)
- [Ideogram 4.0 homepage](https://ideogram.ai/)
- [Freepik AI alternatives 2026 (eesel)](https://www.eesel.ai/blog/freepik-ai-alternatives)
- [12 Best Krea AI Alternatives 2026 (Morphed)](https://morphed.app/blog/krea-ai-alternatives)

### Chatbot 多模态模式

- [ChatGPT vs Claude vs Gemini for Content Creation 2026 (Miraflow)](https://miraflow.ai/blog/chatgpt-vs-claude-vs-gemini-content-creation-2026)
- [ChatGPT Images 2.0: Full Developer Breakdown 2026](https://www.buildfastwithai.com/blogs/chatgpt-images-2-0-gpt-image-2-2026)
- [Google updates Gemini app at IO 2026 (TechCrunch)](https://techcrunch.com/2026/05/19/google-updates-its-gemini-app-to-take-on-chatgpt-and-claude-at-io-2026/)

### Obsidian 生态

- [AI Assistant plugin (obsidianstats)](https://www.obsidianstats.com/plugins/ai-assistant)
- [Aloud TTS plugin (obsidianstats)](https://www.obsidianstats.com/plugins/aloud-tts)
- [Text to Speech plugin (obsidianstats)](https://www.obsidianstats.com/plugins/obsidian-tts)
- [Audio Brief — notes to AI podcast (forum)](https://forum.obsidian.md/t/audio-brief-turn-your-notes-into-ai-generated-podcasts-inside-obsidian/111182)
- [Building My First Obsidian Plugin: notes to spoken dialogue (Medium)](https://medium.com/@m.corbinevans/building-my-first-obsidian-plugin-turning-written-notes-into-spoken-dialogue-with-ai-df89d5f2fb94)
- [Notes to podcast RSS via n8n](https://n8n.io/workflows/2699-obsidian-notes-read-aloud-using-ai-available-as-a-podcast-feed/)

### 学术

- [Multimodal RAG Survey (GitHub / arXiv 2502.08826)](https://github.com/llm-lab-org/Multimodal-RAG-Survey)
- [Ask in Any Modality: Multimodal RAG Survey (arXiv 2502.08826)](https://arxiv.org/pdf/2502.08826)
- [Multi-RAG: Adaptive Video Understanding (arXiv 2505.23990)](https://arxiv.org/abs/2505.23990)
- [VideoRAG: RAG over Video Corpus (arXiv 2501.05874)](https://arxiv.org/pdf/2501.05874)
- [BayesRAG: Probabilistic Mutual Evidence (arXiv 2601.07329, 5-pair 98% poison attack)](https://arxiv.org/pdf/2601.07329)
