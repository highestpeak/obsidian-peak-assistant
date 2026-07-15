# Peak Composer 开源编辑器工具选型调研

调研日期：2026-07-09  
目标：判断 Peak Composer 是否应该直接集成现成开源编辑器，还是只借鉴其 UI/架构，再用 Obsidian/CodeMirror 6 原生方式实现核心块体验。

## 结论

你的判断是对的：Peak Composer 的 mock 看起来像一整套编辑器页面，因此不能默认从零写完整编辑器。开源生态里已经有大量成熟方案，尤其是 ProseMirror/Tiptap、Milkdown、MDXEditor、Vditor、Cherry Markdown、Lexical、Plate、BlockNote、Editor.js。

但对 Peak Assistant 来说，最重要的约束不是“有没有漂亮编辑器”，而是：

- Obsidian 当前编辑器基于 CodeMirror 6；
- 用户的 Markdown 文件必须继续是 source of truth；
- 图片、表格、callout、wikilink、frontmatter、Obsidian callout 这类语法必须 round-trip；
- 插件不能接管整个 workspace 或破坏 Obsidian 原生编辑行为；
- AI 写入需要走可审查的 patch/transaction，而不是富文本内部状态静默保存。

所以建议不是“把某个编辑器直接塞进 Obsidian 替代原编辑器”。更稳的路线是：

1. **生产实现主线：继续走 Obsidian/CodeMirror 6 editor extension + block widget/decorations。**
2. **调研/原型主线：用 Milkdown、MDXEditor、Vditor 做 isolated prototype，验证图片、表格、callout 的 Markdown round-trip。**
3. **UI 借鉴主线：从 BlockNote、Tiptap templates、Umo Editor、Plate 学 slash menu、block handle、floating toolbar、inspector、AI action 的交互。**

一句话：**不要从零写编辑器内核，但也不要直接把外部 editor 当 Obsidian editor runtime。**

## 本仓库当前条件

`package.json` 已经有这些相关依赖：

- React 18 / React DOM 18；
- CodeMirror 6：`@codemirror/state`, `@codemirror/view`；
- Markdown AST：`remark`, `remark-gfm`, `remark-frontmatter`, `remark-wiki-link`；
- UI：Radix、Tailwind、lucide-react、framer-motion；
- 构建：esbuild，Obsidian bundle 目标 CommonJS / ES2018。

这说明我们不需要从零建立 React UI 和 Markdown 解析基础。更值得谨慎的是：如果引入 ProseMirror、Lexical、Slate 这类完整编辑器，会同时存在两个编辑器 runtime，Obsidian 的 active editor 与外部 editor 的 state/selection/undo/history 会变成双系统。

## 候选总览

GitHub stars / pushed_at 通过 GitHub API 于 2026-07-09 检查。npm version/license 通过 `npm view` 检查。

| 工具 | 当前信号 | 数据模型 | 对 Peak Composer 的判断 |
| --- | --- | --- | --- |
| [Milkdown](https://github.com/Milkdown/milkdown) | 约 11.7k stars；MIT；2026-07 仍活跃 | Markdown / ProseMirror / remark | 最值得做 prototype 的 Markdown-first WYSIWYG 框架 |
| [MDXEditor](https://mdxeditor.dev/editor/docs/overview) | 约 3.6k stars；MIT；React | accepts/emits Markdown string；Lexical 内核 | 很适合验证“React 组件 + Markdown string round-trip” |
| [Vditor](https://github.com/Vanessa219/vditor) | 约 11.1k stars；MIT；中文生态强 | Markdown editor，多模式 | out-of-box 最强，适合作为体验 benchmark，不一定适合深度定制 |
| [Cherry Markdown](https://github.com/Tencent/cherry-markdown) | 约 4.7k stars；Apache-2.0；中文生态 | Markdown editor，custom syntax | 表格/图片 WYSIWYG 参考价值高，产品风格可能偏通用编辑器 |
| [Tiptap](https://tiptap.dev/docs/editor/getting-started/overview) | 约 37.6k stars；MIT；生态大 | ProseMirror schema/state | 最强通用 framework，但 Markdown 不是天然 source of truth |
| [BlockNote](https://www.blocknotejs.org/) | 约 9.9k stars；npm MPL-2.0 | block schema，Markdown import/export | UI 很接近 Notion，但 block schema 会压过 Markdown |
| [Umo Editor](https://github.com/umodoc/editor) | Vue3 + Tiptap；MIT；Word-like | rich document model | 如果真要 Vue/Word-like 独立页面，可参考；不适合直接嵌 Obsidian editor |
| [Lexical](https://lexical.dev/) | 约 23.6k stars；MIT；Meta | editor state/nodes | 性能和可访问性强，但需要自己建 Markdown 约束层 |
| [Plate](https://platejs.org/) | 约 16.4k stars；MIT on npm；shadcn/UI 友好 | Slate/Plate rich-text model | UI 组件和 AI editor 模式值得借鉴，Markdown-first 弱 |
| [TOAST UI Editor](https://github.com/nhn/tui.editor) | 约 18.0k stars；MIT；最近 push 2024 | Markdown/WYSIWYG 双模式 | 成熟但维护信号偏弱；作为参考，不建议作为新核心 |
| [Editor.js](https://editorjs.io/) | 约 31.8k stars；Apache-2.0 | block JSON | UI 模型好，但输出 JSON，不符合 Obsidian Markdown source-of-truth |
| [Slate](https://www.slatejs.org/) | 约 31.7k stars；MIT；仍 beta | custom rich-text model | 自由度大但开发成本高，不适合第一阶段 |
| [CodeMirror 6](https://codemirror.net/examples/decoration/) | 本仓库已依赖；Obsidian 原生编辑器路线 | text document + decorations/widgets | 生产接入最稳，UI 要自己做一部分 |

## 最值得重点看的工具

### 1. Milkdown

官方定位是 plugin-driven WYSIWYG Markdown editor，受 Typora 启发，基于 ProseMirror 和 remark。它和 Peak Composer 的方向最接近：不是纯 HTML 富文本，而是围绕 Markdown 建编辑器。

适合我们拿来做：

- isolated prototype；
- Markdown parser/serializer 思路参考；
- table/image/callout 自定义 node 的技术参考；
- slash menu / block component 的交互参考；
- Vue/React 之外的 core editor 参考。

风险：

- 它仍然是 ProseMirror editor，不是 Obsidian 当前 CodeMirror editor；
- 直接嵌入会产生双 selection、双 undo、双 history；
- Obsidian-specific 语法需要额外适配，尤其是 wikilink、embed、callout、frontmatter、block id；
- 大 vault 文档的 source-position mapping 需要单独验证。

判断：**第一候选 prototype engine，不是第一候选生产 editor runtime。**

### 2. MDXEditor

MDXEditor 明确说自己是 React Markdown/MDX rich text editor，接受并输出 Markdown string，并且没有中间 HTML 表示。这一点非常贴合我们的 source-of-truth 原则。

适合我们拿来做：

- React 内的快速实验；
- 测试 Markdown string round-trip；
- 观察图片、表格、code block 的 WYSIWYG 行为；
- 研究 toolbar/plugin 架构；
- 做一个 “Composer standalone playground”。

风险：

- 内核是 Lexical，不是 Obsidian CodeMirror；
- Obsidian wikilink/callout/frontmatter 支持需要扩展；
- MDX/JSX 能力对 Obsidian 不是核心，可能引入额外复杂度；
- 若用于生产替换 active editor，仍会遇到双 runtime 问题。

判断：**最适合作为 React prototype 的候选。**

### 3. Vditor

Vditor 支持三种模式：WYSIWYG、即时渲染、分屏预览。它的中文生态、Typora-like 即时渲染、数学公式、图表、GFM、toolbar、移动端等覆盖很广。

适合我们拿来做：

- 体验 benchmark；
- 中文用户预期参考；
- Markdown WYSIWYG/table/image 行为参考；
- 快速本地 demo。

风险：

- UI/toolbar 一体化比较强，深度融入 Peak 设计语言可能费劲；
- 不是 React-native 组件心智；
- 很多能力是通用 Markdown editor 能力，可能和 Obsidian/Peak 的边界不一致；
- 直接嵌入仍然绕开 Obsidian active editor。

判断：**最好作为 benchmark 和验证对象，不一定作为内核。**

### 4. Cherry Markdown

Cherry Markdown 是腾讯开源的 JavaScript Markdown editor，强调 out-of-the-box、轻量、可扩展，并且文档里专门有 Image WYSIWYG、Table WYSIWYG、自定义语法、streaming rendering 等内容。

适合我们拿来做：

- 表格/图片编辑体验参考；
- 中文产品语境参考；
- 自定义语法和 toolbar 配置参考；
- streaming rendering 与 AI chat 场景参考。

风险：

- 它是完整 Markdown editor，不是 Obsidian editor extension；
- 产品风格偏通用 Web Markdown 工具；
- 如果直接集成，需要处理样式隔离、bundle 体积、selection/undo/history 分裂。

判断：**很值得读源码/交互，但不该直接决定 Peak 的 editor runtime。**

### 5. Tiptap

Tiptap 是生态最大的一类候选。它是 headless rich-text editor framework，基于 ProseMirror，扩展能力很强，React/Vue/Svelte/plain JS 都能接。

适合我们拿来做：

- 独立 Web 编辑器；
- Word-like / Notion-like prototype；
- slash command、drag handle、floating menu、table extension；
- Vue3 方案参考，比如 Umo Editor。

风险：

- Tiptap 的真实 source of truth 是 ProseMirror document schema；
- Markdown 通常是 import/export，不是天然持久层；
- 要做到 Obsidian Markdown round-trip，需要自己写 parser/serializer 和边界规则；
- 商业 Pro extensions 可能诱导我们依赖付费能力。

判断：**强 framework，但除非我们决定做独立 Composer runtime，否则不应优先落到生产。**

### 6. BlockNote

BlockNote 是 ready-to-use 的 block-based React editor，支持 block editing、协作、现成 UI，体验最像 Notion。

适合我们拿来做：

- block interaction 参考；
- drag handle、slash menu、block toolbar、side menu；
- 快速说明“Notion-like 体验长什么样”；
- 低成本 mock/prototype。

风险：

- 数据模型是 BlockNote block schema；
- Markdown import/export 存在语义损耗风险；
- npm license 是 MPL-2.0，需要发布前确认合规边界；
- 如果把它作为核心，Peak Composer 会从 Markdown-first 滑向 block-schema-first。

判断：**UI 参考价值很高，生产核心风险较大。**

### 7. Lexical / Plate / Slate

这些都是强大的富文本框架：

- Lexical：轻量、性能和可访问性好，插件化；
- Plate：基于 Slate，带 shadcn/ui 风格组件、AI editor 模式；
- Slate：高度可定制，但仍处于 beta 心智，很多事情要自己搭。

适合我们拿来做：

- 参考 floating toolbar / AI editor / comments / rich-text plugin 设计；
- 独立编辑器产品；
- 长期如果放弃 Markdown-first，可以作为内核候选。

风险：

- Markdown 不是核心持久层；
- 自己维护 Markdown 约束层成本高；
- 会把问题从“做块级增强”扩大成“做完整富文本编辑器”。

判断：**暂时不适合作为 Peak Composer v1 内核。**

### 8. Editor.js

Editor.js 的 block UI 非常符合“块编辑”直觉，输出干净 JSON，生态里有图片、表格、拖拽等工具。

但它和我们的核心约束冲突最大：它的 source of truth 是 JSON block data，不是 Markdown file。用它做 Obsidian note editor，会让 Markdown 变成导入/导出格式，而不是源文件。

判断：**可以借鉴 block toolbox，不适合做核心。**

### 9. CodeMirror 6

CodeMirror 6 不是 WYSIWYG editor，但它是 Obsidian 编辑器生态的现实基础。官方 decorations 支持 mark、widget、replacing、line 四类装饰，其中 widget/replacing decorations 能把文档某段内容替换成可交互 DOM。

适合我们拿来做：

- Obsidian 内真正安全的生产实现；
- 图片 block widget；
- 表格 block widget；
- callout stable shell；
- source range mapping；
- 原生 undo/redo；
- 与 Obsidian selection、commands、workspace、插件兼容。

风险：

- 现成 UI 少，需要自己做 block toolbar、inspector、drag handle；
- block widget 的 source mapping 和性能需要严肃测试；
- React 组件挂进 CodeMirror widget 时要注意生命周期；
- 多行 block/replacing decoration 的实现边界比普通 React 页面更难。

判断：**生产路径最稳，UI/交互可以借鉴外部库。**

## 与 Peak Composer 的推荐路线

### 路线 A：生产内核

采用 Obsidian/CodeMirror 6 editor extension：

- 解析当前 Markdown buffer；
- 识别 image/table/callout/link block；
- 对 block 使用 decorations/widgets；
- 通过 CodeMirror transaction 回写 Markdown；
- 右侧 inspector 和 toolbar 用现有 React UI；
- AI action 只产出 patch candidate 或 transaction plan。

优点：

- 不绕开 Obsidian editor；
- selection/undo/history 更一致；
- Markdown 仍是唯一源；
- 兼容普通 Obsidian note。

缺点：

- 没法直接享用现成 editor 的所有交互；
- 表格 widget 会比较难；
- 需要写更多 CM6 专用代码。

### 路线 B：独立 prototype

做一个 `docs/gstack` 或 dev-only playground：

- 用 MDXEditor、Milkdown、Vditor 各做一个最小页面；
- 输入同一份 Obsidian-flavored Markdown；
- 测试 image/table/callout/link 的显示、编辑、导出；
- 截图对比用户体验；
- 记录哪些交互可以抄，哪些语法会丢。

优点：

- 快速验证“不从零写”的真实收益；
- 帮我们避免在 CM6 上重复造错东西；
- 能用真实 demo 说服下一步选型。

缺点：

- prototype 不能直接等于生产实现；
- 如果 demo 太漂亮，容易诱导团队忽视 Obsidian runtime 风险。

### 路线 C：完整替换编辑器

把 active note 内容加载进 Milkdown/MDXEditor/Tiptap/BlockNote，保存时序列化回 Markdown。

优点：

- 最快获得完整 WYSIWYG 外观；
- 图片/表格/toolbar/slash 可能更快出来；
- 对普通 Web app 很合理。

缺点：

- 对 Obsidian 插件非常危险；
- undo/redo、selection、commands、folding、plugins、mobile、theme、hotkeys 都要重接；
- Markdown round-trip 不稳定时会直接伤用户文件；
- 容易演变成“在 Obsidian 里面再造一个编辑器应用”。

判断：**不建议作为 v1。**

## 具体评分

评分是为了帮助选型，不是客观真理。5 分最高。

| 工具 | Markdown-first | Obsidian runtime fit | UI ready | Custom block | React/TS fit | V1 综合 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| CodeMirror 6 widgets | 5 | 5 | 2 | 4 | 4 | 生产主线 |
| MDXEditor | 5 | 2 | 4 | 3 | 5 | React prototype |
| Milkdown | 5 | 2 | 4 | 5 | 4 | Markdown prototype |
| Vditor | 5 | 2 | 5 | 3 | 3 | benchmark |
| Cherry Markdown | 4 | 2 | 4 | 4 | 3 | reference |
| Tiptap | 3 | 2 | 3 | 5 | 5 | framework reference |
| BlockNote | 2 | 1 | 5 | 4 | 5 | UI reference |
| Umo Editor | 2 | 1 | 5 | 4 | 2 | Vue/Word-like reference |
| Lexical | 2 | 2 | 3 | 5 | 5 | long-term framework |
| Plate | 2 | 2 | 5 | 4 | 5 | UI/AI reference |
| Editor.js | 1 | 1 | 5 | 4 | 4 | block UI reference |
| Slate | 2 | 2 | 2 | 5 | 5 | not v1 |

## 建议的下一步 spike

做一个很小的 read-only + round-trip spike，不要先接生产代码。

### Spike 1：Markdown round-trip harness

输入一份覆盖 Obsidian 语法的 fixture：

```md
---
type: design
---

# Editing view

> [!info] Design rule
> Keep Markdown visible.

![[architecture.png|Architecture screenshot|640]]

| Block | Behavior |
| --- | --- |
| Image | Resize |
| Table | Cell edit |

[[Related Note#Heading]]
https://forum.obsidian.md/t/example
```

分别用 MDXEditor、Milkdown、Vditor 载入，再导出 Markdown，对比：

- frontmatter 是否保留；
- callout 是否保留；
- wikilink image 是否保留；
- table 是否稳定；
- link/card 是否可降级；
- unknown syntax 是否会崩或被吃掉。

### Spike 2：CM6 image widget

在 Obsidian active editor 里只做一个 image block：

- 识别 `![[...]]` 和 `![alt](path)`；
- 用 widget 显示图片壳；
- 支持 caption text edit；
- 修改 width 后写回源文本；
- undo/redo 正常；
- 切回 Source/Live 不丢内容。

如果这个 spike 失败，就不要贸然扩展到 table/callout。

### Spike 3：UI pattern extraction

从外部库只提炼 UI pattern：

- BlockNote：block handle / slash menu / side menu；
- Plate：AI editor / shadcn-style toolbar；
- Umo Editor：Word-like toolbar density；
- Vditor/Cherry：表格和图片 WYSIWYG 操作；
- Milkdown：Markdown-first editor componentization。

把这些 pattern 更新回 Peak Composer mock，而不是直接引入对应 editor runtime。

## 推荐决策

短期决策：

> Peak Composer v1 不直接集成完整外部 editor；先做 MDXEditor/Milkdown/Vditor 对照 prototype，再以 CodeMirror 6 widgets 作为生产接入路线。

中期决策：

> 如果 round-trip harness 证明 Milkdown 或 MDXEditor 能稳定处理 Obsidian-flavored Markdown，可以考虑把它们作为 dedicated Composer view 的可选 runtime，但不能默认替代 active Markdown editor。

长期决策：

> 如果 Peak Assistant 未来要做一个脱离 Obsidian 的独立 Web editor，再重新评估 Tiptap/BlockNote/Plate/Umo Editor 作为完整 editor engine。

## Sources

- [Milkdown GitHub](https://github.com/Milkdown/milkdown)
- [Milkdown Vue recipe](https://milkdown.dev/docs/recipes/vue)
- [MDXEditor overview](https://mdxeditor.dev/editor/docs/overview)
- [BlockNote official site](https://www.blocknotejs.org/)
- [Tiptap docs](https://tiptap.dev/docs/editor/getting-started/overview)
- [Vditor GitHub](https://github.com/Vanessa219/vditor/blob/master/README_en_US.md)
- [Cherry Markdown GitHub](https://github.com/Tencent/cherry-markdown)
- [TOAST UI Editor GitHub](https://github.com/nhn/tui.editor)
- [Lexical official site](https://lexical.dev/)
- [Plate official site](https://platejs.org/)
- [Editor.js official site](https://editorjs.io/)
- [CodeMirror decorations example](https://codemirror.net/examples/decoration/)
- [Obsidian editor extension docs](https://docs.obsidian.md/Plugins/Editor/Editor%2Bextensions)
- [Umo Editor GitHub](https://github.com/umodoc/editor)
