# Composer 长文档运行时最终设计

## 目标

Composer 对短文档和长文档使用同一套运行时。文档模型始终完整，DOM、编辑器和浏览器原生交互对象始终有界。打开 Composer、全文跳转、AI 批量编辑、选择、查找、拖动、评论与历史都不能用“把全文挂到 DOM”换取正确性。

这不是一个“长文档模式”，也不限制文档长度。它把现有全文同步渲染器替换成统一的文档会话、布局索引和窗口化投影。

## 已确认的问题

- 目标文档有 405 个顶层块、452 个单元和 375 个 Markdown 链接。解析耗时约 32 ms，不是主因。
- 当前 `ComposerDocument` 对所有可见块直接 `map`，每个文本块创建独立 contenteditable、编辑控制器、历史状态、布局副作用和键盘监听。
- 每一行还各自订阅候选列表，并对候选和 findings 重复过滤。
- 录屏中的一次点击包含约 1093 ms handler 和约 897 ms forced reflow，随后 Renderer 灰屏。
- 同时段三个 macOS crash report 都终止于 Chromium Renderer 的 CppHeap young-generation GC，而不是 Markdown 解析器。
- 当前从 Markdown 切换时先销毁原生视图再开始读取 Composer 文档，因此首开存在空白窗口。
- 当前“接受多个候选”逐个提交；第一次提交改变 revision 后，其余同批候选会 stale，无法表达一次 AI 批量改动。

## Impact Contract

### 主指标

- 已挂载块行数量只随视口、overscan 和少量硬固定项增长，不随全文块数增长。
- 普通长文档行使用专用静态行壳；`contenteditable`、完整交互行、ResizeObserver 和编辑控制器数量同样有界。
- 快速滚动时不仅同时挂载数量有界，单位滚动距离内的完整交互子树分配量也必须有界。
- 静态行从第一次挂载就呈现最终 Markdown 链接、标记和公式样式；滚动停止不更换 renderer。
- 候选投影在文档根只订阅一次，并按 block id 建索引。
- 同一 base revision 的 Markdown 候选可一次预检、一次写入、一次 reparse、一个 History/Undo 单元完成。
- Markdown → Composer 在准备完成前保留原视图；恢复或首次创建 Composer 叶时，React host 先绘制文件级骨架，再开始同步 composition，不能出现无内容白屏。

### 必须完成的轨道

1. App-owned prepared session 与准备后切换。
2. 变高块布局索引、窗口投影、滚动锚定和高度测量。
3. DOM 依赖交互的显式 hard pin 生命周期。
4. 统一 source/block 定位服务，替代“DOM 中找不到就失败”。
5. 候选根订阅、按块索引和 Markdown 候选组原子接受。
6. 首开、恢复、全文跳转、find、drag、focus、IME、selection、comment/history 定位的回归覆盖。
7. 目标文档、1000 块混合文档、5000 块压力文档、500 个候选的真实指标。

### 禁止范围

- 不增加文档长度上限或用户可见的“长文档模式”。
- 不删除现有 Composer 功能来换取性能。
- 不触碰 Chat 的 `Composer.tsx`、CodeMirror 或原生 Markdown 编辑器。
- 不创建第二套文档 runtime、候选 store 或 service 层全局 singleton。
- 不把外部 `.base`、`.canvas`、`.excalidraw` 写入伪装成 Markdown 原子事务。
- 不扩展 SQLite、Vault Intelligence 或无关索引架构。
- 不保留“长文档走虚拟化、短文档全文渲染”的永久双渲染器。

### Skip budget 与停止规则

首开、AI 批量、IME、选择、find/全文跳转、drag、Undo/History、候选审阅和真实 Obsidian 验证的 skip budget 为 0。任一轨道只有静态测试而没有所需交互证据时，整体只能标为部分实现。发生 source revision、视口或交互状态不可比时停止视觉结论；发生不能安全分离的工作区重叠时停止提交。

## 最终架构

### 1. 完整文档会话与有界视图投影

`ComposerDocumentSession` 继续持有完整 source text、blocks、units、references 和 revision。虚拟化只改变 UI 投影，不裁剪领域模型。

```text
ComposerDocumentSession (完整、可事务化)
  -> ComposerBlockLayoutIndex (完整、纯数据)
      -> viewport range + overscan + hard pins
          -> mounted block rows (有界)
              -> ordinary text/list/callout: ComposerStaticBlockRow
              -> active/stateful/object row: ComposerBlockRow
                  -> editor / candidate / finding / error / native preview
```

布局索引以 block id 为稳定查询键，维护顺序、估算高度、实测高度、前缀 offset 和 total height。高度更新必须保持当前锚点的视觉位置，避免图片、表格、候选卡或折叠变化导致滚动跳跃。

首个版本不依赖第三方虚拟列表库。Composer 的块有折叠、插入面板、跨块选择、拖动和 source location 语义，使用小型领域布局索引比把这些合同塞进通用 item API 更清楚，也避免新增运行时依赖。

### 2. 稳定静态行与挂载/卸载合同

长文档中符合静态策略的普通 block 使用 `ComposerStaticBlockRow`，包括：

- 文字与标题；
- 引用与 callout；
- 列表与 task。

这个组件保留与编辑态相同的 Markdown 文本投影和几何，但不拥有完整交互行的运行时负担：

- rail 与 action surface；
- timer 与逐行订阅；
- 编辑控制器与 `contenteditable`。

评论在文档根订阅并按 block id 建索引，静态行只接收当前块的纯数据。

以下情况才升级为完整 `ComposerBlockRow`：

- 用户明确激活该块进行编辑；
- 该块拥有 editor-critical focus、IME、面板或 drag 状态；
- 该块当前显示 candidate、finding 或 invoke error；
- block kind 本身需要专用对象 renderer。

原生 selection endpoint 只负责保持行挂载，不自动升级编辑器，避免 renderer 替换摧毁现有 DOM Range。链接或评论标记获得键盘焦点时同样只保持静态行挂载；用户真正发起编辑后才升级。

普通块只由视口窗口决定是否挂载。以下状态可 hard pin 一个块：

- 当前 focus 或 IME composition 所在块；
- 有未 flush 的 direct edit；
- 依赖真实 DOM anchor 的打开面板；
- 正在拖动的源块和当前 drop 邻域；
- 正在 reveal/flash 的目标；
- 当前原生 selection 的端点块。

候选数据、评论、findings、History 行和 AI streaming 文本本身不 pin 块 DOM。它们存在 store/projection 中，滚动到附近后才挂载对应 UI。AI 编辑 500 个块不能挂载 500 行。

pin 有明确 owner 和 release：blur 且 flush 完成、compositionend 且 flush 完成、面板关闭、drag end/cancel、reveal 结束、selection collapse。任何 owner 不能无限期遗留 pin。

### 3. Prepare-before-swap

App-owned `DocumentComposerRuntime` 提供短期 prepared-session cache。Markdown 切换流程是：

```text
保存当前 Markdown buffer
  -> prepare(filePath): 读取、解析、准备 session
      -> 若失败，保留 Markdown 并报错
      -> 若成功，setViewState(Composer, preparationId)
          -> Composer controller consume prepared session
              -> 第一帧直接拥有 snapshot
```

prepared entry 有一次性 token、file path、source revision 和过期时间；消费时验证 path，过期后释放。它由 app runtime 持有，不是 service singleton。

工作区恢复没有可保留的 Markdown 视图，因此 Composer 外壳在 runtime/controller 建立前就渲染稳定 skeleton。prepared session 避免了重复 IO/parse，但从完整 snapshot 构造 editing projection 仍可能同步占用一帧以上；`DocumentComposerView` 必须先挂载 React host，绘制与目标文件绑定的 skeleton，跨过真实 paint 后才能调用 controller start。`onOpen` 先于 `setState` 或 `setState` 先于 `onOpen` 都走同一个 paint gate。

### 4. 统一定位与导航

所有 block/source 定位先查询布局索引，再滚动 `.pk-composer-main`，等待目标行挂载和测量，最后执行精确 DOM 定位与 flash/focus。调用方不再直接 `querySelector(...).scrollIntoView()`。

```text
source offset / block id / candidate / comment / history / find match
  -> resolve block in complete snapshot
  -> layoutIndex.scrollOffsetFor(block)
  -> update viewport projection
  -> await mounted target
  -> exact inline/unit DOM reveal when available
```

找不到 target 必须是领域层的 missing/stale 结果，而不是“该块滚出屏幕所以不存在”。折叠区先展开再计算布局。

### 5. Selection、IME 与编辑

短距离、当前窗口内的原生 DOM selection 继续提供浏览器原生文本体验；持久状态同时映射为 source offsets。滚动让端点离开窗口时，DOM Range 只作为投影，source range 才是事实。复制、格式、评论和 AI 指令基于 source range 生成 operations。

IME 期间所在块 hard pin，`compositionend` 后先 flush 再释放。虚拟化不得卸载 activeElement、composition owner 或待 flush editor。直接编辑提交后，通过 block matching 迁移稳定行 key 和 layout measurement。

### 6. 虚拟拖动

drop 目标由 pointer 的 document-space Y 和布局索引计算，不依赖所有块 DOM。视口边缘 autoscroll 更新滚动位置后重新查询 index。只有拖动源、当前 drop 前后邻居和打开 surface 需要 pin。

### 7. 候选投影与批量接受

候选 runtime 在文档根订阅一次，构造：

- `pendingCandidates`；
- `candidatesByBlockId`；
- `candidateById`；
- 可选的 `readyMarkdownGroup`。

行组件只读取传入数组，不自行订阅或全量 filter。findings 同样在根按 block id 索引。

`acceptMany(candidateIds)` 只接受同一当前 base revision、状态 ready、结果属于当前 Markdown 文档的候选。提交前预检：

- id 唯一且全部存在；
- 同一 base revision；
- operation 坐标有效；
- replace ranges 不重叠；
- 同点插入保持确定顺序；
- structural operations 不产生歧义；
- native-file patch 不进入该组。

预检成功后，所有 operations 以 base-revision 坐标排序并交给一次 `hub.commit`。成功后统一标记 accepted，并只发布一次最终 projection。History 和 Undo 是一个 transaction；失败则 source、候选状态、History 和 Undo 都不改变。

外部 native file patch 仍逐文件使用自己的 revision guard 和 receipt；跨文件失败显示部分结果，不能声称跨文件原子。

## 配置

虚拟化参数加入 `templates/config/composer.json` 并在 `composerConfig.ts` 有类型化 fallback：默认块估高、按 kind 估高、overscan 像素、reveal 对齐、prepare cache TTL、最大 hard pins 与诊断阈值。逻辑文件不硬编码阈值。

## 诊断与验收证据

Composer 根节点暴露只读诊断 dataset 或测试 probe：总块数、窗口 start/end、mounted rows、editor pins、hard pins、hydrated block、candidate count 和 layout total height。静态行暴露 `data-static-block-row="true"`，用于证明普通窗口没有退回完整交互壳。生产 UI 不展示这些内部指标。

完成条件：

- 目标文档连续打开 10 次，无灰屏、无新增 CppHeap crash report。
- 1000 块混合 fixture 首屏 mounted rows/editors 有界，滚动高度稳定，首尾跳转正确。
- 5000 块压力 fixture 不产生与全文等量 DOM。
- 5000 块压力 fixture 的普通已挂载行全部使用静态行壳，不包含 rail、action row 或 editor；首屏 wikilink 与 external link 已具备最终语义和样式。
- 完整滚动遍历不因窗口变化创建普通 `contenteditable`，也不在 idle 时更换 renderer。
- 500 个 ready Markdown 候选不增加 mounted rows；一次接受产生一次 write、一次 reparse、一个 History/Undo 单元。
- 当前行编辑、中文 IME、跨块选择、find next/previous、评论/History/candidate 定位、drag/autoscroll、Undo/Redo 在真实 Obsidian 通过。
- focused tests 和 production build 通过；若真实 renderer 不可连接，必须明确标记 `INTERACTION NOT VERIFIED`，不能把 harness 升格为验收。
