# fal.ai Endpoint & Schema Research — 2026-07-21

> **目的：** 核实仓库占位配置所用 fal.ai endpoint 的真实可用性、请求 schema、响应格式、定价，输出配置修正清单。
> **状态：** §7 配置修正清单已全部落地（`templates/config/media-generation.json` + 两个 fal adapter + 域默认），§6 授权要点已写入 Settings → Media Generation 的 music 区说明。基于公开文档核实，未做真实付费调用（无 key）。

---

## 1. text-to-video

### 现值
`fal-ai/veo3/text-to-video`（`media-generation.json` `video.default.model`）

### 核实结论
**`fal-ai/veo3/text-to-video` 不存在。**
- 正确主路径为 `fal-ai/veo3`（无 `/text-to-video` 子路径）
- 且 **`fal-ai/veo3` 已被标记为 Deprecated**：API 页明确显示 "This model is no longer supported."
- 继任模型为 **`fal-ai/veo3.1`**（2026 年现行），以及 lite 变体 `fal-ai/veo3.1/lite`

### 推荐 endpoint

| 优先级 | Endpoint ID | 说明 |
|--------|-------------|------|
| 主选（quality 默认） | `fal-ai/veo3.1` | 高质量，支持 720p/1080p/4K |
| 备选（低成本） | `fal-ai/veo3.1/fast` | 快速/低价变体 |
| 极简备选 | `fal-ai/veo3.1/lite` | 最轻量，无 4K |

### 请求 payload 字段（`fal-ai/veo3.1`）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `prompt` | string | 是 | 视频描述 |
| `aspect_ratio` | enum: `"16:9"` \| `"9:16"` | 否 | 默认 `"16:9"` |
| `duration` | enum: `"4s"` \| `"6s"` \| `"8s"` | 否 | 默认 `"8s"` |
| `resolution` | enum: `"720p"` \| `"1080p"` \| `"4k"` | 否 | 默认 `"720p"` |
| `generate_audio` | boolean | 否 | 默认 `true` |
| `negative_prompt` | string | 否 | — |
| `seed` | integer | 否 | 复现控制 |
| `auto_fix` | boolean | 否 | 默认 `true`，自动修正违规 prompt |
| `safety_tolerance` | enum: `1`–`6` | 否 | 默认 `4`，仅 API 可设 |

**⚠️ 字段不匹配：** adapter 当前发送 `duration_seconds`（integer，如 `8`），但 API 要求 `duration`（enum string，如 `"8s"`）。需同步修改 adapter。

### 响应产物
```json
{ "video": { "url": "https://...", "content_type": "...", "file_name": "...", "file_size": 0 } }
```
`video.url` 字段名与 `extractMediaUrl` 逻辑一致（`(json as any).video?.url`），响应层无需改动。

### 定价（来源：fal.ai pricing 页 + buildmvpfast.com，2026-07）

| 变体 | 分辨率 | 无音频 | 有音频 |
|------|--------|--------|--------|
| `veo3.1` (quality) | 720p/1080p | $0.20/s | $0.40/s |
| `veo3.1` (quality) | 4K | $0.40/s | $0.60/s |
| `veo3.1/fast` | 720p/1080p | $0.10/s | $0.15/s |

8 秒默认配置（quality, 720p, with audio）= **$3.20/video**。`media-generation.json` 中 `estimatedCostUsd: 0.75` 严重低估。

### 来源
- https://fal.ai/models/fal-ai/veo3/api（deprecated 确认）
- https://fal.ai/models/fal-ai/veo3.1/api
- https://fal.ai/docs/model-api-reference/video-generation-api/veo3.1-lite
- https://www.buildmvpfast.com/api-costs/ai-video
- https://www.veo3gen.app/blog/veo-3-1-pricing-plans

---

## 2. text-to-music

### 现值
`fal-ai/lyria2`（`media-generation.json` `music.default.model`）

### 核实结论
**`fal-ai/lyria2` 存在且可用**，标记为 Google 合作模型，支持商用（"Commercial use" 标记在模型页可见）。最大输出时长 30 秒（非配置的 60 秒）。

主流备选为 `fal-ai/minimax-music/v2.6`（当前最新版本，2026-07），功能更全（支持 lyrics、声乐/纯器乐切换）。

### 推荐 endpoint

| 优先级 | Endpoint ID | 说明 |
|--------|-------------|------|
| 主选 | `fal-ai/lyria2` | 仓库现值，可用，Google 模型，简洁纯音乐 |
| 备选 | `fal-ai/minimax-music/v2.6` | 支持歌词/声乐，功能更丰富 |
| 轻量备选 | `fal-ai/minimax-music/v1.5` | 较低价格（$0.03/clip） |

### 请求 payload 字段（`fal-ai/lyria2`）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `prompt` | string | 是 | 音乐风格/场景描述 |
| `negative_prompt` | string | 否 | 默认 "low quality" |
| `seed` | integer | 否 | 复现控制 |

**⚠️ 字段不匹配：** adapter 当前发送 `duration_seconds`（`req.durationSeconds ?? 20`），但 `fal-ai/lyria2` API 文档**不接受** `duration_seconds` 字段——输出时长固定约 30 秒，由模型决定。adapter 中 `music` 分支里的 `duration_seconds` 字段为多余字段（可能被忽略，也可能引起报错）。

### 请求 payload 字段（`fal-ai/minimax-music/v2.6`，备选对比）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `prompt` | string | 是 | 风格/场景描述，10–2000 字符 |
| `lyrics` | string | 否 | 歌词，支持 `[Verse]` `[Chorus]` 等结构标签 |
| `lyrics_optimizer` | boolean | 否 | 为空 lyrics 自动生成歌词 |
| `is_instrumental` | boolean | 否 | true = 纯器乐 |
| `audio_setting` | object | 否 | sample_rate/bitrate/format |

### 响应产物
```json
// lyria2
{ "audio": { "url": "https://...", "content_type": "...", "file_name": "...", "file_size": 0 } }
// minimax-music
{ "audio": { "url": "https://..." } }
```
`audio.url` 均与 `extractMediaUrl` 现有逻辑一致。

注意：lyria2 输出为 **48kHz WAV**；adapter 的 `extensionAndMime` 先检查 `.wav` 后缀，可正确识别。

### 定价

| 模型 | 价格 | 单位 |
|------|------|------|
| `fal-ai/lyria2` | $0.10 | /30s 片段 |
| `fal-ai/minimax-music/v2.6` | $0.15 | /audio |
| `fal-ai/minimax-music/v1.5` | $0.03 | /audio |

`media-generation.json` 中 `estimatedCostUsd: 0.05` 偏低；lyria2 实际为 $0.10/30s。

### 来源
- https://fal.ai/models/fal-ai/lyria2/api
- https://fal.ai/models/fal-ai/lyria2
- https://fal.ai/models/fal-ai/minimax-music/v2.6/api
- https://fal.ai/learn/tools/best-text-to-music-apis-2026

---

## 3. text-to-speech (TTS)

### 现值
`fal-ai/kokoro/american-english`（`media-generation.json` `tts.default.model`）

### 核实结论
**`fal-ai/kokoro/american-english` 存在且可用，2026 年仍在活跃维护。**

### 请求 payload 字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `prompt` | string | 是 | 要合成的文本（**注意：字段名是 `prompt`，不是 `text`**） |
| `voice` | VoiceEnum | 否 | 见下方枚举列表 |
| `speed` | float | 否 | 速度，默认 1.0，范围 0.1–5.0 |

**可用 voice 枚举（完整列表，2026-07）：**
`af_heart, af_alloy, af_aoede, af_bella, af_jessica, af_kore, af_nicole, af_nova, af_river, af_sarah, af_sky`（10 female）
`am_adam, am_echo, am_eric, am_fenrir, am_liam, am_michael, am_onyx, am_puck, am_santa`（9 male）

**adapter 一致性：** adapter 当前发送 `{ text: req.prompt, voice: req.styleHint || 'af_bella' }`。
**⚠️ 字段名不匹配：** adapter 发送 `text`，但 API 要求 `prompt`。需将 `tts` 分支改为 `{ prompt: req.prompt, voice: ... }`。

默认 voice `af_bella` 仍在枚举列表中，配置值有效。

### 响应产物
```json
{ "audio": { "url": "https://fal.media/files/.../xxx.wav" } }
```
`audio.url` 与 `extractMediaUrl` 一致。

### 定价
**$0.02 / 1,000 字符**（= $1.00 / 50,000 字符）。`media-generation.json` 中 `estimatedCostUsd: 0.002` 正好对应 100 字符，粒度合理但应注释说明单位。

### 来源
- https://fal.ai/models/fal-ai/kokoro/american-english
- https://fal.ai/models/fal-ai/kokoro/american-english/api

---

## 4. text-to-image

### 现值
`fal-ai/fast-sdxl`（`media-generation.json` `image.default` 与 `cover-hd`）

### 核实结论
**`fal-ai/fast-sdxl` 存在且可用，2026 年仍是 fal 主力 SDXL 端点，活跃维护。**

### 请求 payload 字段

| 字段 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `prompt` | string | 是 | — | 正向提示 |
| `negative_prompt` | string | 否 | `""` | 负向提示 |
| `num_images` | integer | 否 | 1 | 生成张数 |
| `image_size` | ImageSize \| enum | 否 | `square_hd` | 见枚举 |
| `num_inference_steps` | integer | 否 | 25 | — |
| `guidance_scale` | float | 否 | 7.5 | — |
| `seed` | integer | 否 | — | — |
| `format` | enum: `jpeg` \| `png` \| `webp` | 否 | `jpeg` | — |
| `enable_safety_checker` | boolean | 否 | true | — |
| `loras` | list<LoraWeight> | 否 | `[]` | — |
| `sync_mode` | boolean | 否 | — | 同步返回（非 queue） |

`image_size` 枚举：`square_hd`, `square`, `portrait_4_3`, `portrait_16_9`, `landscape_4_3`, `landscape_16_9` 及自定义 `{width, height}`。

**adapter 一致性：**
- `prompt` ✅ 一致
- `negative_prompt` ✅ 一致
- `image_size` ✅ 通过 `mapAspect()` 函数转换，枚举值与 API 一致
- adapter 未发送 `num_images`（等效为 1），与 `quantity: 1` 默认值一致 ✅

### 响应产物
```json
{
  "images": [{ "url": "https://...", "width": 0, "height": 0, "content_type": "image/jpeg" }],
  "seed": 0,
  "has_nsfw_concepts": [false]
}
```
`images[0].url` 与 `extractMediaUrl` 一致。

### 定价
**约 $0.0023 / image**（SDXL 低端价格，来源多个 2026 比价页面）。`media-generation.json` 中 `estimatedCostUsd: 0.01` 偏高约 4×，可下调。

### 来源
- https://fal.ai/models/fal-ai/fast-sdxl/api
- https://docs.fal.ai/model-apis/fast-sdxl
- https://pricepertoken.com/image
- https://www.teamday.ai/blog/ai-api-pricing-comparison-2026

---

## 5. queue.fal.run 提交-轮询协议核实

### 仓库实现（两个 adapter 共同依赖）
1. `POST https://queue.fal.run/{modelId}` + JSON body + `Authorization: Key {key}`
2. 取 `response.response_url` 进行轮询
3. 轮询：HTTP 200 = 完成；HTTP 202 = pending；其他 = 失败

### 官方协议（2026-07，`docs.fal.ai/documentation/model-apis/inference/queue`）
Submit 响应字段：`request_id`, `response_url`, `status_url`, `cancel_url`, `queue_position`

**⚠️ 一处差异：**
- 官方文档区分 **`status_url`**（返回 `IN_QUEUE` / `IN_PROGRESS` / `COMPLETED` 状态）与 **`response_url`**（返回最终结果，仅 COMPLETED 时可用）。
- adapter 当前**直接轮询 `response_url`**（200 = ready, 202 = pending），跳过了 `status_url` 阶段。
- 这个做法**在实践中可以工作**——fal 的 `response_url` 在任务完成前也返回 202，完成后返回 200 + 结果体，与 adapter 判断逻辑吻合。
- **不是 bug，但非官方推荐路径。** 更规范的实现应先轮询 `status_url` 直到 `COMPLETED`，再一次性请求 `response_url` 取结果。现有轮询模式在超长任务（视频）下的重试次数会更多。

其余内容（Authorization header 格式、Content-Type、request_id 取用）均与官方协议一致。

### 来源
- https://fal.ai/docs/documentation/model-apis/inference/queue

---

## 6. 授权与商用边界要点

### fal.ai 平台层
1. **用户持有输入内容权利**，fal.ai 声明不对 Output Content 的版权归属做担保——"may not be unique across users"（ToS §Output Content）。
2. **商用许可来自模型方**，fal ToS 不独立授予 copyright；具体模型（如 Google Lyria/Veo）商用权由 Google 条款管辖。
3. **fal 禁止逆向训练**：不得利用输出内容改进竞争产品或复现训练数据（ToS §Third Party Materials）。
4. **来源**：https://fal.ai/legal/terms-of-service（最后更新 2026-03-03）

### Google Lyria（lyria2 底层模型）
5. **SynthID 水印不可消除**：所有 lyria2 输出含不可见 SynthID 水印，可在压缩/格式转换后仍被检测识别；水印标志 AI 来源，在音乐分发平台的人工审核中可能触发标记。
6. **商用需披露 AI 来源**：EU AI Act 及主流流媒体平台（Spotify/Apple Music）均要求标注 AI 生成，分发前需准备 proof-of-creation 文档。
7. **版权归属模糊**：纯 prompt 生成的音乐在 USCO 指导方针下"推定非人类创作"，不可直接注册版权；若加入大量人工编曲/制作则可部分主张权利。
8. **不适合"设为本地文件替代品"的用途**：Lyria2 生成内容不能声称为自主创作并以此获得流媒体版权分成，需明确告知用户。
9. **来源**：https://www.rightsdocket.com/insights/google-lyria-3-commercial-use-copyright（Lyria 3 适用，Lyria 2 同系策略）

### Kokoro TTS（kokoro/american-english）
10. **明确商用允许**（模型页标注 "Commercial use"），82M 参数开源权重，fal 托管版本无额外限制记录。
11. **来源**：https://fal.ai/models/fal-ai/kokoro/american-english

---

## 7. 配置修正清单

> 按"文件 / 字段 / 旧值 → 新值"逐条列出。标注 **[CRITICAL]** 的是会导致 API 调用失败的硬错误，**[COST]** 是成本估算偏差，**[SCHEMA]** 是 payload 字段错误。

### 7.1 `templates/config/media-generation.json`

| # | 字段路径 | 旧值 | 新值 | 级别 |
|---|----------|------|------|------|
| 1 | `presets.video.default.model` | `"fal-ai/veo3/text-to-video"` | `"fal-ai/veo3.1"` | **CRITICAL** — 旧 id 不存在且已 deprecated |
| 2 | `presets.video.default.estimatedCostUsd` | `0.75` | `3.20` | **COST** — 8s × $0.40/s（quality+audio，720p）；或改为 `1.20`（8s × $0.15/s fast+audio） |
| 3 | `presets.music.default.estimatedCostUsd` | `0.05` | `0.10` | **COST** — lyria2 官方 $0.10/30s |
| 4 | `presets.music.default.maxDurationSeconds` | `60` | `30` | **COST/UX** — lyria2 最大输出约 30s，设 60 会误导用户预期 |

### 7.2 `src/app/platform/media/FalMediaAdapter.ts` — `buildPayload()`

| # | 位置 | 旧代码 | 新代码 | 级别 |
|---|------|--------|--------|------|
| 5 | `kind === 'tts'` 分支 | `{ text: req.prompt, voice: ... }` | `{ prompt: req.prompt, voice: ... }` | **CRITICAL** — Kokoro API 字段名为 `prompt` 非 `text` |
| 6 | `kind === 'video'` 分支 | `duration_seconds: req.durationSeconds` | `duration: req.durationSeconds ? \`${req.durationSeconds}s\` : '8s'` | **CRITICAL** — Veo3.1 接受 enum `"4s"/"6s"/"8s"` 非 integer |
| 7 | `kind === 'music'` 分支 | `duration_seconds: req.durationSeconds ?? 20` | 删除该字段（lyria2 不接受 duration 参数） | **SCHEMA** — 多余字段可能被忽略或引发 400 |

### 7.3 `src/app/platform/media/FalAsyncMediaAdapter.ts` — `buildPayload()`（module-level function）

| # | 位置 | 旧代码 | 新代码 | 级别 |
|---|------|--------|--------|------|
| 8 | `kind === 'tts'` 分支 | `{ text: req.prompt, voice: ... }` | `{ prompt: req.prompt, voice: ... }` | **CRITICAL** — 同 #5，两文件 mirror |
| 9 | `kind === 'video'` 分支 | `duration_seconds: req.durationSeconds` | `duration: \`${req.durationSeconds ?? 8}s\`` | **CRITICAL** — 同 #6 |
| 10 | `kind === 'music'` 分支 | `duration_seconds: req.durationSeconds ?? 20` | 删除该字段 | **SCHEMA** — 同 #7 |

---

## 附录：模型 endpoint 速查表（2026-07 核实）

| 媒体类型 | 当前仓库值 | 核实结论 | 推荐主选 | 推荐备选 |
|----------|-----------|----------|----------|----------|
| video | `fal-ai/veo3/text-to-video` | **不存在（deprecated）** | `fal-ai/veo3.1` | `fal-ai/veo3.1/fast` |
| music | `fal-ai/lyria2` | 存在可用 ✅ | `fal-ai/lyria2`（保留） | `fal-ai/minimax-music/v2.6` |
| tts | `fal-ai/kokoro/american-english` | 存在可用 ✅ | `fal-ai/kokoro/american-english`（保留） | — |
| image | `fal-ai/fast-sdxl` | 存在可用 ✅ | `fal-ai/fast-sdxl`（保留） | `fal-ai/fast-lightning-sdxl` |

---

*来源汇总（按章节顺序）：*
- [Veo 3 API (deprecated)](https://fal.ai/models/fal-ai/veo3/api)
- [Veo 3.1 API](https://fal.ai/models/fal-ai/veo3.1/api)
- [Veo 3.1 Lite API Reference](https://fal.ai/docs/model-api-reference/video-generation-api/veo3.1-lite)
- [Veo 3.1 Pricing (buildmvpfast)](https://www.buildmvpfast.com/api-costs/ai-video)
- [Lyria2 API](https://fal.ai/models/fal-ai/lyria2/api)
- [MiniMax Music 2.6 API](https://fal.ai/models/fal-ai/minimax-music/v2.6/api)
- [Best Text-to-Music APIs 2026 (fal.ai)](https://fal.ai/learn/tools/best-text-to-music-apis-2026)
- [Kokoro TTS API](https://fal.ai/models/fal-ai/kokoro/american-english/api)
- [fast-sdxl API](https://fal.ai/models/fal-ai/fast-sdxl/api)
- [fal Queue Protocol](https://fal.ai/docs/documentation/model-apis/inference/queue)
- [fal Terms of Service](https://fal.ai/legal/terms-of-service)
- [Google Lyria 3 Commercial Use (RightsDocket)](https://www.rightsdocket.com/insights/google-lyria-3-commercial-use-copyright)
- [AI Image Pricing 2026 (pricepertoken)](https://pricepertoken.com/image)
