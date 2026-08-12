# 06 · 网站内容与首页演示视频

> [返回上线前 TODO](../pre-launch-todo.md)
>
> 优先级：P0/P1 · Release Candidate 收口
>
> 状态：未开始
>
> 前置任务：[剩余功能收口](16-remaining-feature-closure.md)、[README 与公开文档包](04-public-documentation-package.md)、[Owner Dogfood](05-owner-dogfood.md)

## 任务目标

让网站、视频、README 和公开文档共同描述同一个已经验证的 Release Candidate。视频只在功能范围和 UI 稳定后录制定稿。

## 1. 网站内容真值

- [ ] 网站每条能力主张映射到冻结功能清单。
- [ ] 区分 Current source。
- [ ] 区分 Preview / QA closing。
- [ ] 区分 In development。
- [ ] 区分 Research direction。
- [ ] 移除无法从当前 Release Candidate 到达或验证的主张。
- [ ] 检查安装、Docs、GitHub、隐私、贡献和问题反馈链接。
- [ ] 将当前指向私有 `docs/` 的链接替换为公开文档入口。
- [ ] 检查 Open Graph、Twitter card、favicon 和分享图片。
- [ ] 检查 canonical URL 和站内导航。

## 2. 为每个视频准备录制合同

- [ ] 最终完整演示遵循[Final Demo 与 One Continuous Context 场景](22-final-demo-continuous-context-story.md)。
- [ ] Graph 专项演示遵循[Graph 多视图能力宣传与切换演示](21-graph-multi-view-launch-showcase.md)。
- [ ] 原生画布专项演示遵循[Canvas 与 Excalidraw AI 原生编辑宣传与演示](23-canvas-excalidraw-native-ai-editing-showcase.md)。
- [ ] 对应的产品主张。
- [ ] 起始状态。
- [ ] 操作脚本。
- [ ] 成功结果。
- [ ] 独立演示 Vault。
- [ ] 无私人信息的 fixture。
- [ ] 录制窗口和主题。
- [ ] 缩放、分辨率和鼠标样式。
- [ ] 目标时长和字幕。
- [ ] 剪辑节奏和失败重录条件。
- [ ] 对应公开文档链接。

## 3. 视频质量

- [ ] 无等待事故和鼠标乱找。
- [ ] 无调试面板和无关窗口。
- [ ] 无私人 Vault 内容。
- [ ] 无 API key、账号和通知泄露。
- [ ] UI、主题、窗口大小和字幕风格一致。
- [ ] 功能入口、过程和结果能被第一次看到的人理解。
- [ ] 网站文案、视频和当前发布版本一致。
- [ ] 在线页面完成播放和加载检查。
- [ ] 完成移动端基础播放检查。

## 4. 最终内容复核

- [ ] 对照 README 检查网站。
- [ ] 对照公开功能文档检查网站。
- [ ] 对照实际 Release Candidate 检查视频。
- [ ] 删除只在开发环境成立的演示路径。
- [ ] 确认截图和视频中没有过期 UI。
- [ ] 让实际试用者检查内容是否与产品体验一致。

## 完成条件

- [ ] 首页所有视频顺滑、清晰、无隐私问题。
- [ ] 视频不依赖只有开发者环境才存在的状态。
- [ ] 网站、视频、README 和公开文档使用同一个版本真值。
- [ ] 所有公开链接和分享 metadata 通过线上验证。

## 不要做

- 不在 UI 和功能范围稳定前反复录制最终视频。
- 不用 mock 视频证明真实产品能力。
- 不为画面顺滑隐藏真实必要步骤或限制。
