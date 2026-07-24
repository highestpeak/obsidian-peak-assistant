# Peak File Workspace：当前能力审计与设计输入

日期：2026-07-24  
状态：**Source-first audit / supporting evidence**  
生产状态：**Implementation pending / 尚未实现**  
用途：支撑 [Peak File Workspace 正式方案](../../superpowers/specs/2026-07-24-peak-file-workspace.md)；不代表生产功能已经实现。

## 1. 研究结论

Peak Assistant 并不是只能读取 Markdown。当前代码已经能读取并索引 Image、HTML/XML 和 PDF，也有图片生成与编辑、Vault 二进制读取、资源 URL 和 PDF hover 预览等基础能力。

真正缺失的是一条统一的文件工作流：

```text
在 File Explorer 打开文件
  -> 进入与文件类型匹配的工作区
  -> 预览 / 编辑 / 选择上下文
  -> 调用现有 AI 能力
  -> 审阅候选
  -> 安全保存并留下版本记录
```

因此，这不是“再加三个预览组件”。它需要一个 app-owned 的文件工作区注册与生命周期层，同时复用当前 Loader、媒体服务、AI runtime、Vault adapter 和候选审阅语义。

## 2. 当前生产事实

### 2.1 文件读取与索引已经覆盖多种类型

`src/core/document/loader/helper/DocumentLoaderManager.ts` 当前注册：

- Markdown；
- Text；
- Table；
- JSON；
- HTML/XML；
- PDF；
- Image；
- DOCX；
- PPTX；
- Excalidraw；
- Canvas；
- URL。

这组 Loader 的职责是读取、标准化、摘要、切块和索引。它们不注册 Obsidian 文件 View，也不拥有编辑与保存体验。

### 2.2 Image：编辑后端存在，文件工作区不存在

已确认：

- `ImageDocumentLoader` 支持 `jpg / jpeg / png / gif / webp / bmp / svg`；
- `VaultMediaReferenceResolver` 可以从 Vault 或 artifact receipt 解析真实图片字节；
- `MediaGenerationService` 已支持 `operation: 'edit'`；
- Composer 已能构造 base image、mask 和 additional references；
- `ObsidianMediaAttachmentWriter` 发生命名冲突时创建新文件，不静默覆盖。

当前缺口：

- `ImageDocumentLoader.generateImageDescription()` 仍标注多模态 TODO；当前搜索描述路径没有把真实图片传给模型；
- 图片 edit 入口在 Chat Composer，不在图片文件本身；
- 没有 crop region / mask canvas 与文件坐标的统一模型；
- 没有打开图片后的 History、candidate review、Save as version 和 Replace original 流程；
- SVG 被归在普通图片扩展中，但它能包含脚本和外部资源，不能沿用 raster image 的信任模型。

### 2.3 HTML：能读源码，不能像浏览器一样使用

`HtmlXmlDocumentLoader` 当前：

- 读取 `.html / .htm / .xml` 文本；
- 按部分语义标签切块；
- 为搜索和 AI 上下文保留源码内容。

当前没有：

- HTML file view；
- Source / Preview 双模式；
- 相对资源解析；
- sandbox、Content Security Policy（CSP）与网络权限；
- DOM 选择到源码范围的映射；
- AI patch review；
- back / forward / reload 等本地浏览器式控制。

Obsidian 自带 [Web viewer](https://obsidian.md/help/plugins/web-viewer)，适合在桌面端打开外部网页。官方同时明确说明它不是主浏览器替代品，而且第三方插件对 Web viewer cookie 具有很深的访问能力。因此，Peak 不应依赖未公开的内部 Web viewer API，也不应把外部网站登录态自动化混进本地 HTML 文件编辑。

### 2.4 PDF：基础查看存在，AI 文件体验缺失

当前已确认：

- `PdfDocumentLoader` 使用 `pdfjs-dist` 提取逐页文本；
- `ResourcePreviewHover` 和 `WikilinkHoverPreview` 已通过 iframe 预览 PDF；
- Obsidian 自身拥有原生 PDF View，并持续维护 PDF 搜索、选择与链接行为；
- 当前 Loader 使用 CDN worker、standard fonts 和 CMap；离线与 CSP 环境需要单独验证。

当前缺口：

- PDF 当前页、复制选区与 AI sidecar 没有稳定公开的桥接；
- 没有 page-aware citation、OCR fallback 和批注 companion；
- 没有把 PDF 阅读状态接入统一 File Workspace history；
- 如果直接用自定义 View 接管 `.pdf`，会重复实现 Obsidian 已有的成熟能力。

参考：

- [Obsidian Web viewer](https://obsidian.md/help/plugins/web-viewer)
- [Obsidian 1.8 Desktop changelog](https://obsidian.md/changelog/2025-01-30-desktop-v1.8.3/)
- [Obsidian plugin load-time guide](https://docs.obsidian.md/plugins/guides/load-time)
- [Obsidian deferred views guide](https://docs.obsidian.md/plugins/guides/defer-views)

### 2.5 View 与 Preview 基础原语已经存在

`src/app/ui-host/views/ViewManager.ts` 当前集中注册 Peak 的 `ItemView`，但尚未调用 `Plugin.registerExtensions()`。

`src/app/platform/preview/AppVaultPreviewAdapter.ts` 已集中提供：

- `readBinary(path)`；
- `readText(path)`；
- `getResourcePath(path)`。

新的文件工作区应复用这些原语并扩展 app-layer composition，不应在 UI 组件中重新直接访问 `app.vault`。

## 3. 需要保留的现有设计边界

### 3.1 不创建第二套 AI runtime

Image edit 应复用现有 Media Generation runtime。HTML patch 和 PDF intelligence 应通过统一的 AI capability port 接入当前 runtime，并在 AI Capability Gateway 落地后更换 adapter，而不是建立 File Workspace 专属 provider/router。

### 3.2 不把 DocumentLoader 变成 UI registry

Loader 只回答：

- 如何读；
- 如何生成索引内容；
- 如何切块；
- 如何得到摘要。

File Workspace 只回答：

- 打开什么 View；
- 能做哪些操作；
- 如何得到当前可见/选中上下文；
- 如何审阅与保存结果。

两者可共享 `FileKind` 和 MIME 判断，但不得互相拥有生命周期。

### 3.3 不静默覆盖原文件

现有 Composer image contract 已决定：

- 程序变换与 AI 像素变换分轨；
- 默认创建新附件；
- 接受后才替换受控引用；
- 禁止静默覆盖原图。

独立 Image Workspace 延续同一语义。HTML 的 AI patch 只有在用户接受后才能进入 `.html` 源文件；PDF 原件默认只读。

### 3.4 不接管 Obsidian 已经做好的能力

第一版不应重写：

- 外部网站浏览器；
- PDF 基础阅读器；
- Obsidian workspace/tab/popout；
- Vault 文件导航；
- 全局快捷键系统。

Peak 只补 AI 上下文、变换、审阅、版本和文件类型一致性。

## 4. 关键技术验证

正式实现前需要完成四个隔离 spike。

| Spike | 要回答的问题 | 通过标准 |
| --- | --- | --- |
| Extension takeover | `registerExtensions()` 与 Obsidian built-in image view 的覆盖、恢复和卸载行为是什么？ | 启停插件后文件打开行为可恢复；已有 leaf 不损坏 |
| HTML sandbox | `app://` 相对资源、`srcdoc + base`、sandbox 与 CSP 能否同时工作？ | 无 Node/Obsidian parent access；本地 CSS/image 正常；blocked resource 有解释 |
| PDF companion | 不读私有 DOM 时，能拿到哪些公开的 active file/page/selection 信号？ | 至少支持整文件和显式 copied selection；不依赖易碎 selector |
| Popout lifecycle | Image canvas、HTML iframe/CodeMirror、PDF sidecar 在 popout window 是否正确迁移？ | 使用 ownerDocument/defaultView；关闭/重开无 event 或 object URL 泄漏 |

任何 spike 失败都应调整 takeover 策略，不得用私有 Obsidian API 强行绕过。

## 5. 设计输入与未决问题

已决定：

- 建立统一 File Workspace；
- 首批覆盖 Image、HTML、PDF；
- Image 与 HTML 是完整 surface；
- PDF 先采用 native viewer + Peak companion；
- 默认不覆盖原文件；
- 本地 HTML 与外部网页分流；
- AI runtime、权限与 receipt 不复制。

仍需在实现前确认：

- `.svg` 是进入 safe image preview，还是进入 HTML-like source/preview；
- Replace original 的版本副本使用 `Artifacts/File Versions/` 还是单独可配置目录；
- PDF 用户批注是否使用 sibling Markdown companion；
- HTML interactive mode 的网络权限是每文件、每域名还是每次运行确认；
- 移动端是否只提供 read-only fallback，还是完全不注册首批 custom views。

## 6. 推荐下一步

1. 以正式方案中的 Phase 0 完成四个 spike 和 characterization tests。
2. 先落 app-owned registry、common shell 和 save/version contract。
3. Image、HTML、PDF 按正式方案顺序接入。
4. 真机验证完成前，roadmap 状态保持 `implementation pending`。
