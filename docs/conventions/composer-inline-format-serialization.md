# Composer inline format serialization

## TL;DR

Composer 的 inline formatting 只有两个合法域：纯 Markdown 域，或 canonical HTML 域。只要一个重叠样式栈包含下划线、颜色、HTML 高亮或已有 HTML wrapper，该样式栈的所有视觉格式都必须一起写成 HTML；禁止 Markdown delimiter 与 raw HTML 互相嵌套。

## Why

Obsidian 原生 Markdown 不会可靠地解析 raw HTML 内部的 Markdown delimiter。旧 serializer 允许操作顺序决定源码：

```md
<u>不会~~真的~~</u>
不会~~<u>真的</u>~~
```

Composer 的自定义 parser 会递归解释第一种写法，因而可能在 Composer 中看起来正确；原生 Markdown view 却把 `~~` 显示成字面文本。只验证 Composer projection 会掩盖这个差异。

## Serialization contract

### Pure Markdown domain

一个样式栈完全由 Markdown 原生格式组成时，保留可读的 Markdown：

```md
**bold**
*italic*
~~strike~~
[label](https://example.com)
```

### Canonical HTML domain

以下任一条件会让当前重叠样式栈进入 HTML 域：

- 应用下划线、文字颜色或高亮；
- 已有 wrapper 是 `<u>`、`<mark>`、带 style 的 `<span>` 或 canonical `<a>`；
- 当前格式操作跨越一个 HTML 样式 run。

进入 HTML 域后：

- bold、italic、underline、strikethrough、color 与 highlight 一起进入同一个 style set；
- 相邻且 style set 相同的文本 run 合并；
- CSS declaration 使用固定顺序：`font-weight`、`font-style`、`text-decoration-line`、`color`、`background-color`；
- 外部链接使用 `<a href="…" style="…">`；
- 修改只 canonicalize 当前受影响的 inline cluster，不在文档打开时静默重写整篇文件。

```html
<span style="text-decoration-line: underline">不会</span><span style="text-decoration-line: underline line-through">真的</span>
```

### Semantic boundaries

Wikilink、embed、inline code 与 formula 不是普通视觉样式。HTML canonicalization 不得吞掉这些语义：

- `[[wikilink]]` / `![[embed]]` 必须保留 Obsidian 语义和 backlinks；
- `` `inline code` `` 与 `$formula$` 不得转换成普通 `<span>` 文本；
- 可能被 HTML entity 解码而改变可见文本的原始片段必须 fail closed；
- 选择跨越这些边界时必须 fail closed，并提示用户缩小选择范围；
- 外部 URL 可以写成 HTML `<a>`，Vault wikilink 不可降级成普通 `<a>`。

## Do

所有 selection formatting 都经过：

```text
source-aware inline runs
→ apply style mutation to the selected visible intervals
→ expand to the connected formatting cluster
→ merge equal style runs
→ canonical HTML serialization
→ transaction commit and reparse
```

实现入口：

- `src/service/composer/selection/canonicalInlineHtml.ts`
- `src/service/composer/selection/markSerializer.ts`
- `src/service/composer/selection/linkOps.ts`
- `src/service/composer/render/inlineRuns.ts`

删除一个 canonical HTML 样式时，只移除对应 CSS property。其余样式继续保留在 HTML 域：

```html
<!-- remove line-through -->
<span style="font-weight: 700; text-decoration-line: underline line-through">text</span>

<!-- result -->
<span style="font-weight: 700; text-decoration-line: underline">text</span>
```

## Don’t

不要生成 Markdown-inside-HTML：

```md
<u>~~text~~</u>
<mark>**text**</mark>
<span style="color: red">[label](https://example.com)</span>
```

不要把 HTML-inside-Markdown 当成长期规范：

```md
~~<u>text</u>~~
**<mark>text</mark>**
```

这类写法有时能在 Obsidian 中渲染，但仍保留两套 parser 的组合顺序，不是 canonical source。

不要：

- 用 CSS 隐藏泄漏出来的 `**` 或 `~~`；
- 只检查 HTML tags 是否平衡；
- 只用 Composer 自己的 parser 验证 native parity；
- 为了格式合并把 wikilink、code 或 formula 改成普通 HTML 文本。

## Checklist

- [ ] 纯 Markdown 样式没有无必要地转成 HTML。
- [ ] HTML 样式域内不存在 `**`、`*`、`~~` 或 Markdown link wrapper。
- [ ] 相同输入经过不同格式应用顺序后得到相同 canonical source。
- [ ] 一个 combined `<span>` 中的每个 style token 都映射到同一个 source wrapper range。
- [ ] 删除一个 style property 不会删除同一 span 中的其他样式。
- [ ] Wikilink、embed、inline code 与 formula 边界 fail closed。
- [ ] 测试同时覆盖 source output、Composer projection 和真实 Obsidian native rendering。
- [ ] 真机无法连接 CDP 时，将 native interaction 标为 `INTERACTION NOT VERIFIED`，不以 harness 代替。
