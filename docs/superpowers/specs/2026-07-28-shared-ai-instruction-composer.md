# Shared AI Instruction Composer：跨产品表面的统一 AI 输入能力

日期：2026-07-28  
产品方向：**Decided**  
技术状态：**Implemented contract · design retained for review**
生产状态：**Implemented in original workspace · owner interaction QA pending**

配套入口：

- [根级文档索引](../../index.html)
- [Planned Requirements](../../planned-requirements.html#pr-shared-ai-instruction-composer)
- [AI Graph Artifact Platform](./2026-07-28-ai-graph-artifact-platform.md)
- [Chat Studio](../../11-feature-chat-studio-ui-ux.html)
- [Composer Copilot](../../16-feature-document-copilot.html)

> 这是与 AI Graph Artifact Platform、Peak File Workspace 平级的共享产品能力，不属于 Chat Studio、Composer Copilot 或 AI Graph 中的任何一个。

> 2026-08-02 closure：Chat Studio、Composer Copilot 与 AI Search / AI Graph 已共用 `SharedAIInstructionController`、PromptInput primitives 和统一 attachment/context/submission contract。中文 IME、focus、stop / regenerate 仍需真实 Obsidian 交互复核；关闭记录见 [PR-SHARED-AI-INSTRUCTION-COMPOSER](../../planned-requirements.html#pr-shared-ai-instruction-composer)。

## 1. 核心判断

凡是让用户用自然语言指挥 AI 的产品表面，都不应重新实现一套输入框、附件、引用、draft、提交或键盘状态机。

Peak 应提供一个共享的 **AI Instruction Composer**：

```text
Shared AI Instruction Composer
  ├─ Chat Studio adapter
  ├─ Composer Copilot adapter
  ├─ AI Graph Update adapter
  └─ future AI-capable surface adapters
```

共享能力负责一致的输入体验；surface adapter 只负责注入上下文、提交到自己的 capability，并解释自己的输出。

## 2. 当前生产基础

当前代码已经有可继续演进的 shared primitives：

- `src/ui/component/prompt-input/PromptInput.tsx`
- `src/ui/component/prompt-input/PromptInputBody.tsx`
- `src/ui/component/prompt-input/PromptInputAttachments.tsx`
- `src/ui/view/chat-view/components/Composer.tsx` 已消费这些 primitives；
- `src/ui/view/composer/sidecar/CopilotView.tsx` 也已消费同一组 primitives。

这说明 Chat Studio 和 Composer Copilot 已经共享输入核心，但还不能据此宣称完整的跨产品 capability 已完成。draft / history、submit / stop、context shelf、model policy、run state 与 surface adapter contract 仍需要明确收口。

AI Graph Update 应成为新的 consumer，不应复制 Chat Studio Composer，也不应把这项共享能力降级成 AI Graph 内部组件。

## 3. 共享能力负责什么

### 3.1 输入核心

- 多行文本、selection、focus 与光标行为；
- CodeMirror editor lifecycle；
- IME composition guard；
- Enter、Shift+Enter、Escape 与 submit / stop 键盘语义；
- loading、streaming、error、disabled 与 retry 状态；
- draft、recent instruction 与恢复行为；
- accessibility name、focus restoration 与 detached-window-safe 行为。

### 3.2 Context 与附件

- `@`、`[[` 与 `/` trigger；
- Vault file / block、current selection、artifact reference 与 custom context item；
- 文件附件、拖放、类型识别、hash 去重、移除与清理；
- context chip / shelf 的统一可视表达；
- 用户明确添加的 context 与 surface 自动注入 context 分开显示。

### 3.3 共享 chrome

- placeholder、submit label、cost / permission hint 的稳定插槽；
- attachment、context、history、submit / stop controls 的共同布局规则；
- full composer、sidecar composer 和 compact instruction composer 的受控 presentation variant；
- Light / dark theme、窄屏与键盘导航的一致行为。

## 4. Surface adapter 负责什么

| Consumer | 自动上下文 | Submit 目标 | 输出 |
| --- | --- | --- | --- |
| Chat Studio | conversation、assistant、attachments、explicit refs | chat run | assistant message / artifact |
| Composer Copilot | document、selection、block、document state | document capability | candidate / patch / review |
| AI Graph Update | graphId、baseVersion、selection、sources、lens、review state | graph update capability | semantic diff |

Surface adapter 可以提供不同 placeholder、suggestion 与 context resolver，但不能 fork 输入核心。

## 5. Ownership 与依赖方向

正确依赖：

```text
shared AI Instruction Composer capability
  ↑ consumed by surface adapters
  ├─ Chat Studio
  ├─ Composer Copilot
  └─ AI Graph
```

禁止：

- shared composer import Chat conversation store；
- shared composer import Composer Copilot 私有 store；
- shared composer 持有 AI Graph canonical state；
- AI Graph 复制 PromptInput DOM / CSS 或附件逻辑；
- 某个 surface 把 provider / model / permission policy 硬编码进 shared core；
- 用“视觉看起来一样”替代真实 component / behavior reuse。

App layer 负责组合 shared capability、surface adapter 和对应 runtime。每个 surface 只通过自己的 submit port 交出 instruction envelope。

## 6. AI Graph 的接入边界

AI Graph Update adapter 注入：

- `graphId` 与 `baseVersionId`；
- 当前 node / relation selection；
- sources 与 freshness；
- active lens 与 review context；
- 用户显式新增的 Vault / Web / manual / existing-graph context。

Submit 后：

1. shared composer 交出 instruction + explicit context；
2. AI Graph adapter 组装 graph update envelope；
3. AI Graph runtime 返回 semantic diff；
4. preview / revise / cancel 不改变 graph；
5. accept 才创建 immutable version。

Shared composer 不理解 node、relation 或 version 的 canonical 语义。

## 7. 状态与持久化

- 输入 draft 是 user interaction state，不属于 graph artifact 或 chat message；
- surface 可以选择 session draft 或可恢复 draft，但必须使用统一 draft contract；
- attachment / context ref 保存 stable identity，不把大对象复制进 UI store；
- submit receipt 记录 surface、capability、context refs 与 run identity；
- semantic output 由各自产品能力持久化，shared composer 不成为第二事实源。

## 8. 实现与验收

实现不是“抽一个更大的万能组件”。应保留：

- headless shared state / behavior；
- 可组合的 PromptInput primitives；
- surface-owned adapter 与 chrome slots；
- presentation variants，而不是 surface forks。

最低验收：

- Chat Studio、Composer Copilot、AI Graph 使用同一 shared input capability；
- `@` / `[[`、附件、IME、Enter / Shift+Enter / Escape、focus 与 submit / stop 行为一致；
- 三个 surface 的自动 context 可见、可区分且不会写进用户输入正文；
- AI Graph submit 产生 semantic diff，Chat submit 产生 message，Composer submit 产生 candidate；
- shared core 不依赖任何 consumer store；
- 删除任一 consumer 不影响另外两个；
- 组件复用由 import / contract test 证明，不能只靠截图。

## 9. 非目标

- 不强迫三个 surface 使用完全相同的尺寸和 chrome；
- 不把各 surface 的 runtime、history 或 artifact 合并成一个系统；
- 不让 shared composer 决定模型路由、permission 或 canonical persistence；
- 本文不授权 consumer 绕过共享 contract 另建输入 runtime；后续改动仍需按对应 surface 单独验收。
