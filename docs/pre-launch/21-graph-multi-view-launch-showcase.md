# 21 · Graph 多视图能力宣传与切换演示

> [返回上线前 TODO](../pre-launch-todo.md)
>
> 优先级：P1 · Graph 重点宣传任务
>
> 状态：待 Release Candidate 冻结后执行
>
> 前置任务：[剩余功能完成与 Release Candidate 冻结](16-remaining-feature-closure.md)、[Owner Dogfood](05-owner-dogfood.md)
>
> 下游任务：[网站内容与首页演示视频](06-website-and-demo-videos.md)、[Final Demo](22-final-demo-continuous-context-story.md)、[朋友试用与外部内容检查](07-external-beta.md)

## 任务目标

把 Graph 作为 Peak Assistant 的重点能力展示。宣传内容不能只放一张“节点很多”的静态图，而要让用户看到：同一批知识在切换 scope、layout、lens 或 semantic relation 后，会显露不同的结构，并帮助用户完成不同判断。

最终演示必须来自真实 Release Candidate 和独立演示 Vault。当前源码中的入口与配置只是候选清单，所有对外主张仍需经过真实 Obsidian 验收。

## 1. 建立上线版 Graph 能力清单

先按真实用户入口盘点，不把所有名为 Graph 的内部模块混成一个功能。

### Vault Search Result Graph

- [ ] 验证 List、Graph 和 Tree 之间的真实切换路径。
- [ ] 验证 Graph 中实际可用的六种 layout：Constellation、Community、Flow down、Flow right、Folder 和 Orbit。
- [ ] 验证 structural/semantic relation 切换。
- [ ] 验证 node focus、hub、inspector 和打开文件的后续动作。

### File Atlas Graph

- [ ] 验证 Local/one-hop、two-hop 和 AI scope。
- [ ] 验证六种共享 layout 在当前文档 neighborhood 中的实际表现。
- [ ] 验证 structural/semantic relation 切换。
- [ ] 验证节点加入工作区、打开相关文件和返回当前文档的路径。

### AI Graph

- [ ] 验证当前版本真实可达的 lenses。
- [ ] 候选 lenses 包括 Topology、Thinking Tree、Bridges、Timeline 和 Gaps。
- [ ] 验证每个 lens 的数据确实存在，不展示空壳切换。
- [ ] 验证来源、关系证据、版本和恢复能力与公开文案一致。

### 其他 Graph surface

- [ ] 审计 Vault Intelligence、Chat artifact 或其他入口中的 Graph。
- [ ] 只有普通用户可达、行为稳定并通过真实验收的 surface 才进入首发宣传。
- [ ] Nebula、Healing Ray 和 Source-Sink 等 Roadmap 高级可视化保持未来方向，除非上线前被正式纳入并完成收口。

## 2. 每种视图必须回答一个用户问题

宣传不能只说“有很多视图”。每个被采用的视图都要绑定一个清楚的用户问题和可见结果。

| 视图或切换 | 用户要回答的问题 | 演示中的可见结果 |
| --- | --- | --- |
| Constellation | 我的内容整体怎样连接？ | 关系分布、中心节点和孤立区域变得可见 |
| Community | 哪些内容自然形成主题群？ | 社区分组和跨群连接被突出 |
| Flow down / right | 关系是否具有方向或过程？ | 同一数据按上下或左右方向重新组织 |
| Folder | Vault 目录结构与知识关系如何交叠？ | 文件夹层级与跨目录连接同时可见 |
| Orbit | 哪些内容围绕核心节点组织？ | 中心与周边材料的层级更清楚 |
| Semantic toggle | 除显式链接外还有什么潜在关系？ | semantic edges 出现或隐藏，差异可比较 |
| Topology | 这批材料的知识结构是什么？ | 文档与概念关系形成整体结构 |
| Thinking Tree | 想法如何推演或分支？ | 层级与推演方向被展开 |
| Bridges | 哪些材料连接不同主题？ | bridge documents 与跨域路径被突出 |
| Timeline | 想法如何随时间演进？ | 时间顺序与演化链可见 |
| Gaps | 哪些主题之间存在结构空缺？ | communities 之间的 gaps 与机会被标出 |

表中的名称只是当前源码候选。最终页面必须使用 Release Candidate 中真实可见的英文 UI label。

## 3. 首页叙事

- [ ] 首页先说明 Graph 帮用户理解什么，不以“漂亮的图”为主要价值。
- [ ] 将 Graph 描述为可切换的知识观察方式，而不是单一固定布局。
- [ ] 用一个真实问题贯穿演示，例如理解项目结构、找到跨主题桥梁或发现知识空缺。
- [ ] 在切换前用一句短字幕说明当前问题。
- [ ] 在切换后用一句短字幕指出新视图揭示的结果。
- [ ] 展示从关系图继续打开文件、检查来源或加入后续工作的动作。
- [ ] 页面附近链接到 Graph 的公开功能说明和限制。

候选方向可以包括：

- `See your vault from more than one angle.`
- `Switch perspectives. Find structure, bridges, and gaps.`
- `From folders to meaning—explore the same knowledge through different views.`

这些只作为后续英文文案输入，不在本任务中直接批准。

## 4. 录制切换效果

### 演示脚本

- [ ] 使用同一份经过设计的 demo dataset，确保不同视图之间具有可比较性。
- [ ] 先停留在一个可读的初始视图，让用户看清当前结构。
- [ ] 真实点击 scope、layout、lens 或 semantic toggle。
- [ ] 保留布局切换和稳定下来的过程，不用剪辑伪造产品没有的动画。
- [ ] 切换完成后 hover 或选择一个关键 node/edge，展示其意义。
- [ ] 从 Graph 继续执行一次真实动作，例如打开文件、查看 inspector 或检查来源。

### 镜头组合

- [ ] 首页准备一个短而连续的主循环，只展示两到三个最能说明价值的切换。
- [ ] 功能详情区分别展示 Search Graph、File Atlas Graph 和 AI Graph。
- [ ] 为全部已批准视图提供较完整的长版演示或文档动图，不把所有切换塞进 Hero。
- [ ] 同时准备可暂停的最终状态截图，照顾不播放视频的用户。
- [ ] 视频字幕说明“为什么切换”，而不只是重复按钮名称。

## 5. Demo Vault 与视觉准备

- [ ] 使用不含私人内容的独立 Vault。
- [ ] 数据需要同时包含清楚的 clusters、bridge、timeline 和至少一个 gap。
- [ ] 文件夹结构与语义关系不能完全重合，否则 Folder 与 Community 的差异不明显。
- [ ] 节点数量足以展示结构，但标签在录制分辨率下仍可读。
- [ ] 为所有镜头固定主题、窗口尺寸、缩放和侧栏状态。
- [ ] 记录 query、active file、Graph scope、layout/lens 和 semantic toggle 初始状态。
- [ ] 预热需要生成或索引的数据，但不能隐藏普通用户首次使用必须经历的关键步骤。

## 6. 真实性与质量闸门

- [ ] 每个被宣传的 view 在当前 Release Candidate 中由普通用户可达。
- [ ] 每次切换使用真实产品控件，不用 mock 或后期替换画面。
- [ ] view 切换后节点、关系、标签和 inspector 内容与同一数据源一致。
- [ ] layout 动画无明显跳闪、重叠、裁切或长时间不可读状态。
- [ ] zoom、pan、fit、hover、selection 和打开文件等镜头中的交互真实可用。
- [ ] 键盘和鼠标焦点不会在切换后丢失到无关 surface。
- [ ] Graph 为空、数据不足或 AI 生成失败时具有诚实的用户反馈。
- [ ] Search Graph、File Atlas Graph 和 AI Graph 的名称与边界在文案中不混淆。

真实验收遵循 [Obsidian Real-UI QA](../conventions/obsidian-real-ui-qa.md)。切换效果需要短视频证明；单张最终截图不能证明动画、状态延续或交互过程。

## 7. 宣传素材清单

- [ ] 首页 Graph 主循环视频。
- [ ] Search Graph 的视图切换短片。
- [ ] File Atlas 的 scope、layout 和 semantic toggle 短片。
- [ ] AI Graph 的 lens 切换短片。
- [ ] 每个已批准视图的一张可读静态图。
- [ ] Graph 功能说明文档。
- [ ] 社区发布可复用的短视频、GIF 或截图组。
- [ ] 对应 alt text、字幕和文字版结果说明。

## 完成条件

- [ ] 上线版 Graph surface、view 和限制已经盘点并通过真实 Obsidian 验收。
- [ ] 每个被宣传的视图都有明确用户问题，不只是视觉变化。
- [ ] 首页实际展示至少一次真实 Graph 视图切换。
- [ ] 核心切换视频同时展示切换过程、稳定结果和下一步动作。
- [ ] 网站、README、公开文档和发布帖使用同一套 Graph 名称与能力边界。
- [ ] 朋友试用者能看懂不同视图的用途，并能说出至少一个对自己有价值的使用场景。

## 不要做

- 不用一张复杂静态图代替视图切换。
- 不把节点数量或动画效果当作 Graph 的主要用户价值。
- 不在一个短镜头中快速闪过所有视图，导致用户无法理解差异。
- 不宣传当前只有空状态或测试数据才能出现的 lens。
- 不把 Roadmap 中的高级可视化写成已上线能力。
- 不用 mock、后期合成或调试入口证明生产能力。
