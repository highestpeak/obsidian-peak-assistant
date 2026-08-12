# Shared Graph Workspace 真实 Obsidian Owner 验收清单

> 产品规范：[Shared Graph Workspace 产品与交互最终规范](../specs/2026-08-12-shared-graph-workspace-product-and-interaction-spec.md)  
> 视觉基准：[单页最终稿](../../gstack/shared-graph-workspace-2026-08-12/index.html)  
> 实施计划：[Shared Graph Workspace 实施计划](./2026-08-12-shared-graph-workspace-implementation-plan.md)

## 1. 验收状态词

- `PASS`：真实 Obsidian 中按指定步骤通过，并有 DOM/视频或截图证据。
- `FAIL`：真实 Obsidian 中可复现不符合规范。
- `INTERACTION NOT VERIFIED`：只有源码、测试、build 或 Mock 证据。
- `NOT COMPARABLE`：source revision、viewport、theme、zoom 或状态与基准不同。

静态 Mock 的“看起来正确”不能记为 `PASS`。

## 2. 验收前锁定

记录到本次 evidence manifest：

- 当前 commit SHA 和目标文件 SHA-256。
- Obsidian 版本、主题、app zoom。
- `innerWidth`、`innerHeight`、`devicePixelRatio`。
- 当前 Vault fixture、宿主 tab、scroll anchor。
- Graph view、scope、projection、selection、inspector、viewport 和 fullscreen 状态。
- reference / current / normalized current / overlay 的路径与 SHA-256。

任一关键条件不同，先修复环境，不开始视觉判断。

## 3. 五分钟 Owner 主流程

### A. World Search

- [ ] 打开 Vault Search，切换 List → Tree → Graph。
- [ ] 选中 Graph 后没有 One hop / Two hop / AI Graph。
- [ ] 页面没有 `68 matched nodes` 或 `Search result graph` 之类额外整行说明。
- [ ] Projection 为 `Constellation / Community / Flow → / ↓ / Folders / Orbit`。
- [ ] 动作栏悬浮在画布右上角，Mini Map 在右下角，快捷键在左下角。

### B. File Atlas

- [ ] Tree 状态显示文字，Scope 不可见也不可 Tab 到达。
- [ ] 点击 Graph 时 Tree / Graph 压成图标，One hop / Two hop / AI Graph 从 Graph 后方快速长出。
- [ ] Scope 看起来属于同一个控制体，不是第二个 button group。
- [ ] One hop 和 Two hop 重新加载正确邻域，控制条与画布位置不跳。
- [ ] AI Graph 替换同一 Projection 槽位为五个 AI lens。

### C. AI Search · Sources

- [ ] List / Tree 时不出现 Graph Scope。
- [ ] Graph 时才出现 One hop / Two hop / AI Graph。
- [ ] 已移除 `Vault links around the cited sources` 独立说明行。
- [ ] cited sources 的 List / Tree 数据和 physical graph 数据没有丢失。
- [ ] AI Graph empty、ready、error 三种状态都保持同一 Workspace geometry。

### D. Composer Relations

- [ ] 关系工作区与最终稿中的 Composer 位置一致，不是另一个风格完全不同的 Graph。
- [ ] 上下文明确来自当前文档和 frozen selection。
- [ ] 查看节点或 AI Graph 不自动产生多文件写入。
- [ ] Open source / Add to context 等动作继续走宿主现有显式权限链。

### E. AI Graph Artifact

- [ ] Topology、Thinking tree、Bridges、Timeline、Gaps 都通过 Cytoscape 渲染。
- [ ] 版本、provenance、evidence inspector 和 open details 保留。
- [ ] `Evidence links` 替代 `Semantic edges`，但动作位置不变。
- [ ] 代码和 bundle 中没有新的 React Flow 路径；旧 `MultiLensGraph` 已按计划退休。

## 4. Motion 专项

用短视频而不是静态截图验证：

1. `List → Graph → Tree`：文字压缩、Scope 展开和收回。
2. `Constellation → Orbit → Community`：近距离和长距离 active thumb。
3. `One hop → AI Graph → Two hop`：Scope thumb、Projection 替换和 viewport。
4. 连续快速点击：动画从当前位置追向最后目标，不排队、不回弹、不闪烁。
5. 开启 reduced motion：状态立即更新，无位移和 stagger。

Owner 判断标准：滑动可见但不拖沓。任何控制在点击后出现明显等待感，或继续使用 240–300ms 的慢胶囊动画，都记为 `FAIL`。

## 5. 键盘与 inspector 专项

- [ ] 方向键在 View、Scope、Projection 内按 roving tab 规则移动。
- [ ] Graph-only 控件收起后不留在 tab order。
- [ ] 按住 Shift 显示临时 inspector，松开后消失。
- [ ] `I` 固定后松开 Shift 不消失；再次按 `I` 取消固定。
- [ ] 固定后移动节点只更新一张 inspector。
- [ ] Enter 打开正确来源。
- [ ] Escape 依次关闭 Nodes popover、临时 inspector、fullscreen，不穿透关闭宿主。
- [ ] 每一步用 CDP 记录 `activeElement` 和对应状态属性。

## 6. 动作栏、Mini Map 与 viewport

- [ ] 五个 Graph 宿主的动作顺序一致。
- [ ] 普通和 fullscreen 都能看到完整核心动作。
- [ ] Zoom、Fit、Readable view 语义不同且结果稳定。
- [ ] Mini Map 节点和 viewport 框随主画布变化。
- [ ] 进入/退出 fullscreen 保持 scope、projection、selection、zoom 和 viewport。
- [ ] List / Tree 不显示动作栏、快捷键和 Mini Map。

## 7. 证据包

建议目录：

```text
.dev/harness/shots/shared-graph-workspace-<run>/
├─ manifest.json
├─ reference.png
├─ current.png
├─ current-normalized.png
├─ overlay-50.png
├─ dom-assertions.json
└─ recordings/
   ├─ view-scope-motion.mp4
   ├─ projection-motion.mp4
   ├─ inspect-pin-escape.mp4
   └─ fullscreen-viewport.mp4
```

至少需要：

- 一组同条件 reference / current / normalized / overlay。
- 五个宿主的 DOM 状态断言。
- 四段短视频。
- focused tests、build 和 React Flow 清理结果。

## 8. 最终签收条件

Owner 只需要确认四件事：

1. 控制体关系正确：Graph 激活后压缩并长出 Scope。
2. 动画足够快：有滑动感但没有等待感。
3. 五个宿主是同一套能力，不再出现工具栏缩水或布局分叉。
4. AI Graph 的版本和证据语义没有因统一画布而丢失。

四项全部通过，且自动验证无回归，才能把状态从 `INTERACTION NOT VERIFIED` 改为 `OWNER ACCEPTED`。
