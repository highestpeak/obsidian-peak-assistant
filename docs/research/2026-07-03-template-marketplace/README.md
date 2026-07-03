# Template Marketplace — 2026-07-03

## 一句话结论

**分发协议押 GitHub Repo（每个 template = 一个 folder in a known-format git repo）；版本走 semver + git tag；安全审阅走"三档信任"（signed + community + local-only）。技术上复用 Obsidian 的 community-plugin 分发套路，但 template 内容比 plugin 单纯（一堆 markdown + json，不执行 JS）→ 审阅门槛低。骨干押"用户中心化仓库 + 一份 index.json"。**

## 问题定义

Peak 里的 `templates/prompts/` 和 `templates/config/` 全是本地打包。用户想：
1. 从社区下载别人做好的 prompt 集（"金融分析师"、"学术写作"、"技术方案 review"）
2. 分享自己的 template 给别人
3. 版本更新时能升级

## 分发方案

### A. GitHub Central Repo (推荐)
一个 `peak-templates` 官方仓库：
```
peak-templates/
  index.json                     ← 由 CI 生成，列出所有 template
  finance-analyst/
    manifest.json                ← name, author, version, description, license
    prompts/
      analyze.md
      report-generation.md
    config/
      finance-tags.json
  academic-writer/
    manifest.json
    ...
```

Plugin 里"Template Marketplace"面板每小时刷新 `index.json`，展示可用 template。用户点 install → clone folder 到 vault-local `.peak/templates/marketplace/<slug>/`。

**优点**：
- 一站式发现
- 版本管理靠 git commit
- CI 自动化 manifest 校验

**缺点**：需要维护官方仓库。

### B. Decentralized (URL install)
用户直接粘 GitHub URL → plugin fetch 并解析 manifest。

**优点**：无中心化维护
**缺点**：发现性差；安全审阅难

### C. 混合（推荐扩展）
默认从官方 index 拉 + 用户可手动加 3rd party URL 到 "trusted sources"。

## 版本控制

- `manifest.version` = semver
- Plugin 记录 installed version + upstream version
- 用户手动或自动升级；升级前显示 changelog

## 安全审阅

三档：

| 档 | 判据 | 后果 |
|---|---|---|
| Signed | 官方 curator review + 签名 | 绿色徽章，默认允许自动升级 |
| Community | 社区贡献未审 | 灰色徽章，安装前提示 "not reviewed" |
| Local-only | 手动加的 URL | 红色徽章，每次升级都要确认 |

Template 内容纯 markdown + json，不执行代码，所以恶意 template 顶多是 "prompt injection 让 AI 输出坏答案"。审阅重点：
- 有没有 `<system>` label 伪造
- 有没有 base64 编码的恶意指令
- 有没有 tag 名冲突现有 vault

## 竞品参考

- **Obsidian Community Plugins**：中心化 GitHub repo，effective。
- **PromptHub / FlowGPT**：Web-side prompt store，可参考 UI。
- **ComfyUI Manager**：混合模型，参考"多源"设计。
- **Homebrew Cask**：手动 URL install 的模型可参考。

## 成本估算

| 项 | 成本 |
|---|---|
| 官方 repo skeleton + CI | 2 天 |
| Plugin marketplace UI | 3-4 天 |
| Install / upgrade flow | 2 天 |
| Signing / review CI | 3 天 |
| 首批 5-10 个 template curation | 1 周 |

**总计**：2-3 周（含 curation）。

## 决策

- **必要性**：**中**。生态建设需要，但 v1 用户不缺 template。
- **优先级**：Wave 6+。等到有 500+ 活跃用户再启动。
- **依赖**：无。

## Next steps

1. `manifest.json` schema 草稿
2. 官方 repo skeleton + 一个示例 template
3. Marketplace UI mockup
4. 找 5 位 power user 提交 template 试点
