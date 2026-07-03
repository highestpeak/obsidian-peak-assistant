# Work Focus Mode + Project Templates — 2026-07-03

## 一句话结论

**Peak 已有 `focusFolder` 概念（Chat 侧 slot 用 + Ambient 用）；"Work Focus Mode" 是把这个概念升级为"当前工作会话"——一个 named context bundle：{ focusFolder, activeAgentProfile, chatConversationSet, ambientRules, timeWindow }。可以在 Peak 里显式切换 mode（"研究模式" / "写作模式" / "code review 模式"）。项目 template 是这些 mode 的可分发版本。**

## 现有基础设施盘点

- `focusFolder`（Settings → General → Focus Folder）：Chat 检索层过滤。
- `ProfileRegistry`：多 profile 已支持 per-role （chat / copilot / agent / embedding）。
- `SessionContextService`：30 min 衰减 recentActivities。
- ChatConversation 有 `project` 关联。
- `templates/prompts/` + `templates/config/` 已经装 per-feature 模板。

未有：
- 显式"切换 mode"UI
- Mode → 一整套 setting overrides
- Mode template 分发

## Work Focus Mode 设计

一个 mode = 一份 override bag:

```typescript
interface WorkFocusMode {
  id: string;
  name: string;               // "研究模式"
  icon?: string;
  focusFolder?: string;       // 覆盖全局 focus folder
  chatProfileId?: string;     // 切换到指定 profile
  agentProfileId?: string;
  toneOverride?: string;      // 用户 profile 的 tone 临时覆盖
  ambientEnabled?: boolean;
  ambientTemplateId?: string; // 走不同的 push template
  timeWindow?: { start: string; end: string };  // 只在这段时间自动切换
  autoStartOn?: { paths?: string[]; tags?: string[] };  // 打开对应 note 自动切
}
```

存 `plugin.data.workFocusModes[]`。启用 mode 时：
1. Backup 当前状态
2. Apply overrides
3. 全局状态栏显示 "Mode: 研究" chip
4. 切回 default 时 restore

## 项目 template

一个 project template = 一份 workFocusMode + 关联 file:
```
project-template-research/
  manifest.json  (name, description, includes: [modes, prompts, config])
  modes/research.json
  prompts/research-mode-system.md
  config/research-vault-lint.json
  starter-notes/          ← 可选，install 时复制到 vault
    README.md
    kickoff.md
```

Marketplace 里下载后：
- Mode 装到 workFocusModes[]
- Prompt 装到 templates/prompts/
- Starter notes 复制到用户选定的 folder

## 竞品参考

- **Notion Templates**：一份 blueprint，用户 duplicate 使用。
- **Obsidian Advanced Slides**：template 定义 UX。
- **Roam Templates**：同。
- **Cursor Rules**：`.cursorrules` 定义 per-project 行为，参考"per-project override"模式。

## 决策

- **必要性**：**中**。有明显用户价值但非必须。
- **优先级**：Wave 6+。放在 Template Marketplace (R8) 之后。
- **依赖**：R8 分发协议先定。

## Next steps

1. `WorkFocusMode` schema PoC
2. Status bar chip + switch UI
3. 与 R8 marketplace 对齐"如何打包分发一个 mode"
