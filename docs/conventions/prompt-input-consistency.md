# Prompt Input Consistency

## TL;DR

Chat Studio、Peak Composer Intelligence sidecar 和未来所有 AI 输入面必须共享同一个 `PromptInput` 内核、触发语法、键盘规则与视觉 primitive。各 surface 可以拥有不同的上下文、状态和提交 runtime，但不能再实现第二套输入编辑器、picker、focus 语言或附件机制。

Chat Studio 的 `index.html` / `composer-lab.html` 是当前输入壳视觉基线；生产实现的内核 source of truth 是 `src/ui/component/prompt-input/`，视觉 token source of truth 是 `src/styles/peak-tokens.css`。

## Why

2026-07-17 的 Intelligence lab 暴露了一次典型 drift：textarea 自己绘制 `focus-visible` outline，外层 composer 又绘制 `focus-within` border/ring，最终出现方形内框、圆角外框和被切碎的 padding。能力 picker 的搜索框发生了同样问题。

这不是某个页面的局部颜色问题，而是输入边界 ownership 不一致。Chat Studio 已经采用“一层边界 owner”：内部 editor 透明、无 border/outline，外层 shell 统一表达 rest/focus/error。所有输入面都必须遵守这条规则。

“共享”不等于复用整个 Chat `Composer.tsx`。Chat-specific project/source/model/assistant state 和 conversation submit pipeline 仍归 Chat 所有；文档当前块、选区、Ambient relation、capability action 和 document run envelope 仍归 Composer sidecar 所有。

## Source of truth

| 层级 | Source of truth | 责任 |
| --- | --- | --- |
| 输入内核 | `src/ui/component/prompt-input/` | 编辑器、焦点、附件、菜单导航、trigger parsing、标准化 selection |
| Chat adapter | `src/ui/view/chat-view/components/Composer.tsx` | Conversation draft、project/source/model/assistant、Chat submit/runtime |
| 视觉 token | `src/styles/peak-tokens.css` | surface、border、focus、radius、spacing、type、shadow |
| 视觉基线 | `docs/gstack/chat-studio-interactive-2026-07-13/index.html`、`composer-lab.html` | Composer shell 的可审阅 DOM、状态和密度 |
| Sidecar contract | `docs/superpowers/specs/2026-07-15-composer-intelligence-sidecar-ui.md` | Action/context chips、fixed dock、voice-to-draft、run snapshot、document-local result |

Standalone lab 只是 fixture，不得成为能力目录、输入语法或 runtime 的真实来源。

## Do

### 1. 共享内核，隔离 adapter

- Sidecar 生产实现必须使用 `PromptInput`、`PromptInputBody`、`PromptInputAttachments` 及其正式后继组件。
- Chat 与 Sidecar 分别通过 adapter 注入自己的 context registry、action registry、draft owner 和 submit handler。
- Sidecar 不得依赖 `chatViewStore`、`composerStore`、`useChatSubmit`、Chat draft key 或 conversation runtime。
- 共享内核缺能力时，先扩展内核，再让所有使用者在同一迁移波次切换；不保留两个长期兼容分支。

### 2. 一层 focus owner

标准结构：

```text
prompt-input-shell            <- 唯一外框与 focus owner
  context/action shelf        <- 有内容才显示
  editor                      <- transparent; border: 0; outline: 0
  footer
    tools                     <- + / voice / surface-specific tools
    run status                <- model/status / send-or-stop
```

- Editor/input 自身始终 `border: 0; outline: 0`。
- Shell 在 rest 状态使用 neutral/accent-soft border；只有 shell 的 `:focus-within` 绘制 accent border 和一层 tint ring。
- Search/picker 同样由 search shell 拥有 focus，不允许 input 和 wrapper 各画一层。
- 键盘焦点不能被删除：当内部 outline 被抑制时，外层 `focus-within` 必须持续提供可见焦点。

### 3. 共享视觉语法

以 Chat Studio 基线为准：

- Composer 外层使用 `--pk-surface`、`--pk-border-*`、`--pk-radius-lg` 和一层 `--pk-shadow-card`。
- Focus 使用 `--pk-accent` + `0 0 0 3px var(--pk-accent-tint)`，不得再叠 inset border。
- Text editor 水平 padding 为 14px，最大自增长高度约 128px。
- Context shelf 使用约 `7px 9px 0` 的 inset；chip 使用 shared token 和 shared primitive，不另造 surface-local 色板。
- Footer 最低约 38px，`padding: 4px 7px`，只保留一条 `--pk-border-soft` 顶部分隔线。
- Icon control 为 28–30px、glyph 约 14px；send 为 30px 圆形按钮。
- Purple 只表达 focus、selection、send 或真实 AI state；rest 状态保持 neutral。
- Sidecar 可改变宽度、横向 chip overflow 和触摸 hit target，但不能改变 idle/focus/disabled/listening/submitting/streaming/error 的语义。

### 4. 共享触发与键盘语法

- `+`：资源与附件入口。
- `[[`：Vault 文件或目录引用。
- `/`：能力与 workflow。
- `@`：在存在真实 mention registry 前保持未分配。
- 点击按钮与键入触发符必须打开同一个 picker、消费同一 registry、返回同一种 normalized selection。
- “全部能力”可以直接打开 `/` palette，但不得维护第二份能力目录。
- Enter 提交，Shift+Enter 换行；IME composition 期间 Enter 不能提交。
- Escape 优先关闭顶层 picker/voice state；Send 与 Stop 互斥。
- 推荐能力只填入 action/context chips，不自动运行；真正发送时才冻结上下文。

### 5. Sidecar 允许的扩展

Sidecar 可以增加：

- 一个 capability action chip；
- 当前块、选区、邻近段落和 Ambient 来源 context chips；
- 固定底部 dock 与窄屏 right drawer 适配；
- 有真实状态反馈的 voice-to-draft；
- 发送时冻结的 document run snapshot；
- 结果回到正文原位的 preview/accept 流程。

这些扩展必须挂在共享输入内核之外，不能 fork editor、trigger parser、keymap 或 attachment renderer。

## Don't

- 不要在 Sidecar 新写 textarea/CodeMirror trigger parser、menu keyboard navigation、attachment dedupe 或 focus API。
- 不要让 textarea/input 与外层 shell 同时绘制 focus。
- 不要从另一份 mock CSS 复制一组硬编码颜色；加载并消费 `--pk-*` tokens。
- 不要为了“完全一致”把 Chat 的 project/source/model/assistant 状态塞进 Composer sidecar。
- 不要为了 surface 独立而复制 capability/context registry。
- 不要在用户选择能力、材料或语音转录后自动发送。
- 不要让 fixture timer、Web Speech fallback 或 lab in-memory state 成为生产事实。

## Checklist

- [ ] 使用共享 `PromptInput` 内核或明确记录正式迁移路径。
- [ ] 外层 shell 是唯一 focus owner；editor 和 search input 没有第二层 outline。
- [ ] 使用 `--pk-*` token，没有新增平行色板、radius 或 shadow。
- [ ] Text padding、context inset、footer divider、icon/send 尺寸与 Chat Studio 基线一致。
- [ ] Sidecar 的窄宽度适配没有改变共同的状态语义。
- [ ] Typed trigger 与 clicked trigger 使用同一 registry 和 normalized result。
- [ ] Enter / Shift+Enter / IME / Escape / Send-Stop 已验证。
- [ ] Voice 只写草稿，推荐只装配 chips，不自动运行。
- [ ] Sidecar 没有导入 Chat-specific store、hook、draft key 或 runtime。
- [ ] Chat adapter 与 Sidecar adapter 都覆盖 focus restore、picker navigation、disabled/error 和窄屏状态。
