# 来源片段收藏与语音思考

**Status:** 调研候选，值得做原型——尚未进入实施 spec  
**Date:** 2026-07-22  
**读者:** Peak Assistant owner、产品规划者和后续原型实现者  
**关联:** [Roadmap · 调研候选](../../roadmap.html#researching)

## 结论先行

这个方向值得做，但不能定义成“又一个 YouTube 时间戳笔记工具”。时间戳笔记、视频转录、网页高亮和导出 Obsidian 都已有产品覆盖，市场不是空白。

值得验证的是一个更完整的闭环：

1. 用户主动选定视频时间段或网页原文。
2. 用语音记下当时产生的想法，而不是停下来整理一篇完整笔记。
3. 让个人知识库参与回应，找出旧笔记、相关证据或可能的冲突。
4. Vault 只保留可回到原处的片段记录和用户思考，不镜像整个视频或整篇网页。

产品形态建议采用“可独立使用的浏览器扩展 + Peak Assistant companion”。第一个原型只做 YouTube，不同时展开 Bilibili、通用网页、播客和在线课程。

## 真正要解决的问题

收藏完整视频或长网页会把大量未处理内容搬进知识库，但只保存一个 URL 又会丢掉“我当时为什么在意这一段”。问题不是内容无法收藏，而是来源、选区和用户当时的思考彼此分离。

因此，这项能力的基本单位不是“一个视频”，而是一条可回溯的片段记录。它需要同时回答三个问题：

- 我当时看到了什么？
- 我为什么觉得它重要？
- 它和我已有的知识有什么关系？

## 用户完成一次收藏的过程

第一版应保持一条极短的主路径：

1. 用户在 YouTube 观看视频时标记开始点。
2. 观看到有意义的结束位置后，标记结束点。
3. 按住麦克风说出自己的判断、疑问或联想。
4. 扩展显示转录文本和片段范围，用户可以直接保存。
5. 用户可选“问我的知识库”，让 Peak 返回相关笔记和一段有来源的回应。

转录服务失效、AI 不可用或 Obsidian 没有打开时，收藏都不能丢失。浏览器扩展应先在本地建立待同步记录，再尝试转录、知识库回应和 Vault 写入。

## 一条片段记录是什么样子

下面是说明产品语义的示意，不是已接受的存储 schema：

```markdown
---
type: source-capture
source: youtube
url: https://www.youtube.com/watch?v=example
startSeconds: 782
endSeconds: 846
capturedAt: 2026-07-22T20:15:00+12:00
---

# 为什么这个片段值得保留

## 来源片段
[13:02–14:06](https://www.youtube.com/embed/example?start=782&end=846)

> 可选的少量转录摘要或用户选中的原文。

## 我的想法
语音转录后的用户原话。

## 知识库回应
- 相关笔记：[[Existing note]]
- AI 对照片段与旧笔记后给出的建议或冲突提醒。
```

这份记录本身是用户想保留的知识，因此适合以 Markdown 作为最终真值。转录和 AI 运行过程属于机器记录，应继续遵循 [JSONL 机器记录设计](../../superpowers/specs/2026-07-21-machine-record-storage-jsonl-design.md)，不把运行日志塞进用户笔记。

## 市场不是空白，差异在完整闭环

本轮调研只用来判断能力重叠，不代表穷尽市场。截至 2026-07-22，已确认以下产品覆盖了设想的一部分：

- [Readwise Reader](https://docs.readwise.io/reader/docs/faqs/videos) 支持 YouTube 时间同步转录和批注。它的网页扩展也能在原网页上高亮，并导出至 Obsidian。
- [Glasp](https://glasp.co/) 覆盖网页、PDF 和 YouTube 高亮，支持与已收藏内容对话以及导出 Obsidian。
- [YouTube Notes for Obsidian](https://chromewebstore.google.com/detail/youtube-notes-for-obsidia/lffaebgkcndcekmcllkhligpopgdejmj) 已能把时间戳、标题、频道、少量转录和用户笔记直接写入 Vault。
- [HoverNotes](https://hovernotes.io/obsidian-video-notes) 把 YouTube、Udemy 和 Coursera 的视频笔记、时间戳和截图带入 Obsidian，已经接近“浏览器 companion”形态。
- [AVAnnotate](https://avannotate.github.io/documentation/pages/annotations/) 证明音视频批注不必只有单点时间戳，也可以将批注绑定到起止范围。

本轮样本中没有确认到同时完成以下全链路的产品：

- 由用户而不是算法决定收藏哪一段。
- 用语音作为默认的思考输入。
- 把用户的私人知识库加入当次回应。
- 只保存可回溯的片段与思考，不默认收藏完整内容。

这是调研推断，不是“市场上绝对没有”的声明。后续若要独立售卖，仍需实机试用主要竞品，并与真实用户验证支付意愿。

## 为什么建议“独立扩展 + Peak companion”

### 只做 Peak 的附属入口

优点是可以直接复用 Vault Search、AI runtime 和 Markdown 写盘能力。问题是所有用户都必须先安装完整 Peak Assistant，很难单独验证这个新能力的市场。

### 做成独立云笔记产品

优点是更容易单独销售。问题是它会很快演变成另一个帐号、云端库、稍后读和通用 AI 摘要产品，反而丢掉本地知识库的特色。

### 可独立使用的轻扩展，Peak 提供深度集成（推荐）

扩展自己完成最小捕获：

- 片段选择。
- 语音记录。
- 本地排队。
- Markdown 导出。

连接 Peak 后再增加深度能力：

- 复用用户配置的转录 provider。
- 搜索 Vault 里的旧笔记。
- 生成有来源的 AI 回应。
- 将最终记录写入约定目录。

这种形态能同时验证两件事：

- 没有 Peak 的用户是否也愿意用这个捕获方式。
- 个人知识库回应是否足以成为 Peak 的付费差异。

## 技术可行性与边界

### YouTube 时间段

YouTube 嵌入播放器官方支持 `start` 和 `end` 秒数参数，因此回放一个范围在技术上可行。产品不应依赖 YouTube 的公开 Clip 对象。它应自己保存 `videoId + startSeconds + endSeconds`，再在打开或预览时构造播放链接。参考 [YouTube IFrame Player Parameters](https://developers.google.com/youtube/player_parameters)。

### 网页选区

只存 DOM 路径在网页改版后很容易失效。后续的网页 adapter 应同时保存选中原文和前后文。[W3C Text Quote Selector](https://www.w3.org/TR/wpub-ann/) 已给出 `exact + prefix + suffix` 这种可重定位形状。DOM 位置可作为辅助，不应成为唯一锚点。

### 语音转录

Peak 当前已有 [MediaUnderstandingPort](../../../src/core/ports/MediaUnderstandingPort.ts) 和 [OpenAITranscriptionAdapter](../../../src/app/platform/media/OpenAITranscriptionAdapter.ts)，并且在应用组合层将它接入媒体理解 runtime。这证明“将音频字节送入可配置转录 provider”的底座已存在，但浏览器录音、本地排队和跨进程传输仍是新能力。

独立产品还需要决定转录费用由谁承担。可以从 BYOK（用户自带 API key）开始，也可以由付费服务承担，但不能在没有价格和隐私调研的情况下默认走云端。

### 浏览器与 Peak 之间的回写

[Obsidian URI](https://help.obsidian.md/Extending%2BObsidian/Obsidian%2BURI) 适合唤起应用、打开某条记录或传递小型控制参数。它不适合承载音频、长转录和结构化任务状态。

实际 payload 建议在原型中比较两个方案：

- 仅监听 `127.0.0.1` 的本地 HTTP 端口，用一次性配对令牌验证扩展。
- [Chrome Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)，通过安装在本机的 host 与扩展交换 JSON。

本地 HTTP 的安装成本低，但必须严格绑定 loopback、校验 token、限制 payload，并且绝不接受浏览器传入的任意 Vault 路径。Native Messaging 的边界更清晰，但需要额外 host 安装和各平台注册。调研阶段不预先锁定答案。

这两种回写方案都是 desktop 路径。移动端没有浏览器扩展与本地 Obsidian 进程的同等连接条件，不进入第一个原型。

### Vault 存储

浏览器端先用 IndexedDB 或同级的本地存储保留待同步记录。Peak 接收后决定最终 Markdown 路径，浏览器扩展不能直接写任意文件路径。

默认目录应继续遵循 Peak 的单一主目录 mental model，而不是在 Vault 根目录再创建一个全新隐藏目录。具体子目录名称属于后续 spec 决策，本文不硬编一个新名字。

## YouTube-only 原型边界

原型包含：

- 开始点和结束点选择。
- 麦克风录音与转录预览。
- 浏览器本地排队和失败后重试。
- Markdown 导出，以及连接 Peak 后的 Vault 写入。
- 可选的“问我的知识库”，且 AI 失败不影响收藏。

原型不包含：

- Bilibili 和任意网页 adapter。
- 下载或长期保存完整视频。
- 默认导入完整转录。
- AI 自动决定所有“值得保存”的片段。
- 通用稍后读库、社交分享、团队批注或云端同步产品。

## 原型需要回答的问题

不先用下载量或 AI 调用次数代替产品验证。先观察以下真实行为：

- 语音是否真的比打字更不打断观看。
- 用户是否会主动选择起止范围，而不是只记一个时间点。
- 用户之后是否会回到这些片段记录。
- 知识库回应是否促成了链接、修改或进一步思考，还是只产生一段可有可无的 AI 总结。
- 没有 Peak 的用户是否愿意持续使用独立扩展。
- 付费意愿来自无摩擦语音转录，还是来自私人知识库回应。

## 风险和失败方式

### 做成已有产品的复制品

如果主页和原型只展示“YouTube 时间戳 + 转录 + 导出 Obsidian”，用户无法看出与现有扩展的区别。演示必须围绕“说出当下思考，再让私人知识库回应”。

### 把捕获过程做得比记笔记更慢

如果用户需要填标题、选目录、选模型、等 AI 再点保存，产品会失去“不打断观看”的价值。收藏必须先成功，AI 和归档可以在后台完成。

### 来源锚点失效

视频会被删除、变成私密或禁止嵌入，网页也会改版。不保存整份原内容意味着无法消除这个风险。但可以保留少量上下文和用户思考，使原链接失效时记录仍有基本语义。

### 版权与平台边界

原型不下载完整视频，不默认复制完整转录，也不把用户的私人片段发布成公开 Clip。在实施前仍需单独核对 YouTube API/网站条款、浏览器扩展权限和转录内容的存储边界。

### 隐私与本地回写安全

语音、网页选区和知识库摘要都可能含有私密信息。任何云端转录或 AI 请求都必须明示 provider，本地 bridge 也必须防止任意网页伪造请求或覆写 Vault 文件。

## 当前决策和待决问题

**当前可以接受的结论：**

- 这是一个独立的产品方向，不是 Chat 的一个小按钮。
- 值得做 YouTube-only 可用原型。
- 用户主动选段和语音思考是主路径，AI 自动摘要不是主路径。
- 扩展在 Peak 不在线时也要能安全保存。
- Markdown 是用户最终保留的知识记录。运行与重试状态不进入正文。

**仍需验证：**

- 独立产品的目标用户和付费点。
- 默认转录 provider 与费用负担方式。
- 本地 HTTP bridge 与 Native Messaging 的安装成本、安全性和跨平台表现。
- 片段记录的最终 schema，以及 Peak 默认主内容目录（ChatFolder）下的存储位置。
- 当视频没有可用转录时，是否只保存时间范围和用户语音，还是必须增加音轨提取。

## 下一步

1. 亲自试用 Readwise Reader、YouTube Notes for Obsidian 和 HoverNotes，记录真实的时间殳、语音、Vault 回应与离线能力差距。
2. 做一个只包含五步主路径的可点击交互原型，先验证“不打断观看”。
3. 用最小技术 spike 比较 loopback HTTP 和 Native Messaging，只测试配对、断线排队和一次 Markdown 写入。
4. 原型经过真实观看会话验证后，再决定是否进入 `docs/superpowers/specs/` 并拆实施任务。

## 参考

- [YouTube IFrame Player Parameters](https://developers.google.com/youtube/player_parameters) — 起止时间回放的官方能力边界。
- [W3C Web Annotation: Text Quote Selector](https://www.w3.org/TR/wpub-ann/) — 网页原文选区的可重定位数据形状。
- [Chrome Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging) — 浏览器扩展与本地应用通信的官方机制。
- [Obsidian URI](https://help.obsidian.md/Extending%2BObsidian/Obsidian%2BURI) — 唤起、打开、新建和 x-callback-url 能力。
- [Readwise Reader · YouTube Videos](https://docs.readwise.io/reader/docs/faqs/videos) — 时间同步转录、高亮和笔记的竞品边界。
- [YouTube Notes for Obsidian](https://chromewebstore.google.com/detail/youtube-notes-for-obsidia/lffaebgkcndcekmcllkhligpopgdejmj) — 时间戳、转录片段和 Vault 直写的竞品边界。
- [HoverNotes](https://hovernotes.io/obsidian-video-notes) — 跨视频站点的 Obsidian companion 形态。
