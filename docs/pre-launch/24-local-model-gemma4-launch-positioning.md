# 24 · 本地大模型与 Gemma 4 能力宣传

> [返回上线前 TODO](../pre-launch-todo.md)
>
> 优先级：P1 · 本地 AI 重点宣传任务
>
> 状态：Ollama 基础接线存在。Gemma 4 的 Peak 工作流与真实设备证据待完成
>
> 前置任务：[在线模型目录与能力证据收口](23-online-model-catalog-and-capability-registry.md)、[Owner Dogfood](05-owner-dogfood.md)
>
> 下游任务：[网站内容与首页演示视频](06-website-and-demo-videos.md)、[Final Demo](22-final-demo-continuous-context-story.md)、[朋友试用与外部内容检查](07-external-beta.md)

## 任务目标

重点宣传 Peak Assistant 可以把用户在自己机器上运行的模型真正用于笔记工作。宣传对象不只是 Ollama 连接或模型列表，而是本地模型参与日常知识工作的真实结果。

Gemma 4 作为重点演示模型。最终素材需要回答：

- 使用了哪个模型。
- 完成了什么实际任务。
- 结果由哪个 Provider 产生。
- 是否发生了云端升级。

素材还要证明 Peak 不会在没有说明的情况下把本地任务切换到云端。

## 1. 当前能力真值

### 外部模型事实

- [Google Gemma 4 model card](https://ai.google.dev/gemma/docs/core/model_card_4) 确认 Gemma 4 是正式开放模型系列，覆盖面向不同本地硬件的多种规模。
- [Ollama Gemma 4 library](https://ollama.com/library/gemma4) 提供 `gemma4` 本地运行入口与多个 tag。
- 官方模型或 Ollama 页面证明模型可以获得，不等于 Peak 的全部工作流已经兼容。

### Peak 当前事实

- [Ollama provider factory](../../src/core/providers/vercel/provider-factory.ts) 已把 Ollama 接入统一模型调用路径，本地连接不要求 API key。
- [Ollama model discovery](../../src/core/providers/ollama/fetchOllamaModels.ts) 可以从本地 `/api/tags` 读取已安装模型。
- [Onboarding provider readiness test](../../test/onboarding-provider-readiness.test.ts) 已覆盖模型发现与最小生成探测。
- [Harness settings test](../../test/harness-settings-roundtrip.test.ts) 已覆盖 `localFastConfig` 与 `localDeepConfig` 的持久化合同。
- 当前 [bundled model catalog](../../templates/config/models/model-catalog.json) 仍只登记较旧的 Gemma 条目。Gemma 4 的能力证据不能仅依赖名称推测。
- 当前 [shared provider adapter](../../src/core/providers/vercel/vercel-adapter.ts) 会为 Ollama 兼容性把 tool result 降级为文本。完整多步工具续接必须单独实测。
- 尚无 Gemma 4 在真实 Obsidian 中覆盖公开 Peak 工作流的完整验收与宣传素材。

因此当前可以说 Peak 具有 Ollama 本地模型基础，但不能直接声称 Gemma 4 已经完整驱动 Peak 的全部 AI 工作面。

## 2. 核心宣传信息

重点表达用户可以利用已经在本机运行的模型，而不是被 Peak 锁进单一云端模型。候选英文方向：

- [ ] `Put your local models to work across your vault.`
- [ ] `Bring Gemma 4 to your notes.`
- [ ] `Your notes. Your machine. Your model.`
- [ ] `Use local AI first. Escalate only when you choose.`
- [ ] `Leverage the models you already run—inside the work you already own.`

这些是候选文案，不是已经批准的公开主张。`Local AI first` 只有在本地优先路由和显式升级经过验收后才能使用。否则应写成用户可以主动选择本地模型。

## 3. 需要证明的本地工作

### 日常文本任务

- [ ] 在 Chat 或等价入口完成一次基于真实 Vault context 的问答或总结。
- [ ] 在 Composer 中完成一次 rewrite、summarize 或其他已支持的审阅式修改。
- [ ] 完成一次知识维护任务，例如标签建议、相关材料解释或内容归类。
- [ ] 结果明确显示实际使用的 Ollama Profile 与 Gemma 4 model tag。

### Search 与 Graph 相关任务

- [ ] 验证 Gemma 4 是否可以承担 query understanding、结果总结或 Graph finding explanation。
- [ ] 每种 workload 单独记录是否只需要文本生成，还是依赖工具调用与结果续接。
- [ ] 未通过的 workload 从 Automatic 与演示脚本中排除，不用相似的静态输出代替。

### Agent 与工具任务

- [ ] 验证模型能否稳定输出 Peak 需要的 tool call。
- [ ] 验证 Peak 执行授权工具后，tool result 能正确返回模型。
- [ ] 验证模型可以根据 tool result 继续推理并完成任务。
- [ ] 任一环节不通过时，Gemma 4 只能进入不依赖工具的本地角色。

### 多模态任务

- [ ] 只有在 Peak 的真实 image input 链路通过后，才宣传 Gemma 4 的视觉理解。
- [ ] 音频或其他 modality 必须同时满足模型、Ollama adapter 和 Peak surface 三层支持。
- [ ] 不把 Gemma 4 官方 model card 的 modality 范围自动复制成 Peak 功能列表。

## 4. Gemma 4 设备与变体矩阵

不要求为所有 Gemma 4 变体制作演示。根据 Owner 实际发布设备选择一个主变体，并用一个更轻或更深的变体作为对照。

每个进入候选范围的变体记录：

- [ ] 完整 Ollama tag 与 digest。
- [ ] Quantization 与本地文件大小。
- [ ] Mac 型号、芯片和统一内存。
- [ ] 系统版本与 Ollama 版本。
- [ ] 冷启动时间与首 token 时间。
- [ ] 总完成时间与峰值内存。
- [ ] 实际测试的上下文长度，而不是只抄模型标称上限。
- [ ] Text 与 image input 的实测状态。
- [ ] Tools 与 structured output 的实测状态。
- [ ] 通过、降级或失败的 Peak workload。
- [ ] 可接受质量范围和明显失败样例。

最终推荐必须按设备条件描述，例如“适合某类 Apple silicon 与内存范围”，不能把开发机结果写成所有用户都能获得的速度。

## 5. 真实设备验收

- [ ] 固定 Peak commit 与 Obsidian 版本。
- [ ] 固定 Ollama 版本与 Gemma 4 digest。
- [ ] 使用独立、可公开的 Demo Vault 和固定任务输入。
- [ ] 冷启动与 warm run 分开记录。
- [ ] 每个宣传 workload 至少重复三次，记录成功率与波动。
- [ ] Receipt 显示实际本地 Provider、Profile 和 model tag。
- [ ] 断开外网后重复被宣传为离线可用的任务。
- [ ] 通过网络观察确认该任务没有向云端 AI Provider 发送内容。
- [ ] 本地模型失败时不静默切换云端。
- [ ] 如果允许升级到云端，用户必须看见目标 Provider 并明确批准。
- [ ] 验证取消与超时后的错误和恢复。
- [ ] 验证 Ollama 停止与模型卸载后的错误和恢复。
- [ ] 插件 reload 与 Obsidian 重启后，本地模型选择和可用性状态保持真实。

本地运行不自动等于“所有数据永不离开设备”。同一任务若还触发其他外部服务或 Provider，公开说明必须分别列出这些边界。

## 6. 宣传与视频设计

### 首页短片

- [ ] 选择一个十秒内能理解的真实笔记任务。
- [ ] 画面显示 `Gemma 4 · Local` 或等价的真实模型状态。
- [ ] 展示任务在 Peak 产品面中完成，而不是只录制终端输出。
- [ ] 结果之后短暂显示 receipt 或模型归属证据。
- [ ] 不用剪辑隐藏首次加载、失败重试或必要确认。

### 功能详情视频

- [ ] 展示 Ollama 已连接并发现具体 Gemma 4 tag。
- [ ] 分别演示一个纯文本任务和一个真实知识库任务。
- [ ] 如果 Agent 工具循环通过，再加入一个经过授权的工具任务。
- [ ] 如果离线主张通过，加入一段明确的断网验证。
- [ ] 字幕说明设备、模型变体和测试范围。

### Final Demo

- [ ] 如果本任务通过，在 [Final Demo](22-final-demo-continuous-context-story.md) 中让 Gemma 4 自然承担一个明确步骤。
- [ ] 本地模型步骤必须延续同一个 task context，不能另开一个无关演示。
- [ ] 若场景需要云端升级，显式展示用户为何升级以及升级到了哪个 Provider。

## 7. 对外分级

- **完整通过**：可以宣传 Gemma 4 在指定硬件上完成已列明的本地 Peak 工作，并给出设备与能力边界。
- **仅文本工作通过**：只宣传本地问答、总结或文档编辑，不暗示 Agent tools 或 multimodal。
- **只有 Ollama 连接通过**：只能写支持连接本地 Ollama，不能写 Gemma 4 已驱动具体 Peak 工作流。
- **仅模型官方能力存在**：不能形成 Peak 产品主张。

## 完成条件

- [ ] Gemma 4 主演示变体与目标设备已经冻结。
- [ ] 至少三个对外 workload 拥有真实 Obsidian 与本地 Provider 证据。
- [ ] 每项 workload 的 tool、modality 和 context 要求与[模型能力证据任务](23-online-model-catalog-and-capability-registry.md)一致。
- [ ] 本地失败、离线与云端升级边界已经验收。
- [ ] Landing Page、README 和视频使用相同的模型 tag 与能力分级。
- [ ] 朋友试用者能够理解“本地优先”与“本地限定能力”的区别。

## 不要做

- 不把“可以从 Ollama 下载”写成“已经在 Peak 全面可用”。
- 不把 Gemma 4 官方 benchmark 当作 Peak 工作流验收。
- 不因为模型支持 tools 就跳过 Peak tool-result continuation 验证。
- 不把本地模型描述成在所有设备上免费、快速或等质量。
- 不在存在外部 Provider 调用时写“数据绝不离开设备”。
- 不隐藏自动或手动云端升级。
- 不把终端中的一次成功生成当作 Obsidian 产品体验证明。
