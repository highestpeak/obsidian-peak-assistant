# 10 · Owner 人工通读全部文档与代码

> [返回上线前 TODO](../pre-launch-todo.md)
>
> 优先级：P0/P1 · Owner 人工任务
>
> 状态：未开始
>
> 相关调研入口：[打开对应 Codex task](codex://threads/019fe39f-048b-7310-8040-1255c6bdead9)

## 任务目标

Owner 主动、人工地通读项目维护的全部文档与代码，建立自己的完整理解。AI 可以协助生成文件清单、查找调用关系和解释局部疑问，但不能用摘要代替 owner 阅读原文。

Landing Page 是本任务的重点。Owner 需要把页面上的每项公开主张与当前源码、真实入口、可执行链路和验收证据逐项核对。

上面的 Codex 链接只作为相关调研的跳转入口。执行本任务时可以打开它对照问题和线索，但不能把旧 session 的结论直接当成当前真值。

## 1. 建立人工阅读清单

- [ ] 锁定本次阅读使用的 commit、branch 和日期。
- [ ] 列出全部 first-party 文档文件。
- [ ] 列出全部 first-party 源码文件。
- [ ] 列出 tests、templates、tools、website、workflow 和构建脚本。
- [ ] 为每个文件记录未读、已读、需复读或有问题。
- [ ] 将生成文件、依赖目录和二进制资产单独标出。

“全部代码”默认包括项目自己维护的 TypeScript、TSX、JavaScript、CSS、HTML、配置、模板、测试、工具和 workflow。`node_modules`、第三方 vendored 代码、构建产物和二进制资产不要求逐行阅读；应阅读生成它们的 first-party source、配置和边界检查。

## 2. 人工阅读全部文档

- [ ] 根目录 README、AGENTS 和项目配置说明。
- [ ] Roadmap、Progress 和 Planned Requirements。
- [ ] 当前 feature 与 infrastructure 正稿。
- [ ] conventions 与 generated artifact governance。
- [ ] specs、plans、handoffs 和 implementation notes。
- [ ] audits、research、testing 和历史 checklist。
- [ ] website 内容 brief 与公开文档候选。
- [ ] 找出过期、冲突、重复、私有或不应公开的文档。
- [ ] 找出仍被网站或 README 引用的历史文档。

## 3. 人工阅读全部代码

- [ ] 从 `main.ts` 和 app composition 开始理解启动顺序。
- [ ] 阅读 `src/app/` 的 Obsidian 集成与 runtime ownership。
- [ ] 阅读 `src/service/` 的业务编排与 agent/search runtime。
- [ ] 阅读 `src/core/` 的 provider、schema、storage 和基础抽象。
- [ ] 阅读 `src/ui/` 的 view、component、store 和 hook。
- [ ] 阅读 templates/config 与编译 fallback。
- [ ] 阅读 tests，确认代码声称与实际 guard 一致。
- [ ] 阅读 tools、scripts、build pipeline 和 GitHub workflow。
- [ ] 阅读 website 的 HTML、CSS、JavaScript 和资源引用。
- [ ] 记录无法解释的 runtime、双实现、旧路径和隐式依赖。

## 4. Landing Page 重点核对

- [ ] 阅读 `website/index.html`。
- [ ] 阅读 `website/site.css` 和 `website/site.js`。
- [ ] 阅读 Landing Page 内容 brief。
- [ ] 检查 Pages 发布 workflow。
- [ ] 检查图片、视频、Open Graph 和分享 metadata。
- [ ] 检查 Docs、GitHub、安装、隐私和贡献链接。
- [ ] 列出页面上的每项功能主张。
- [ ] 为每项主张找到可见 UI。
- [ ] 为每项主张找到当前源码实现。
- [ ] 为每项主张确认完整可执行链路。
- [ ] 为每项主张确认普通用户可达性。
- [ ] 为每项主张确认真实 Obsidian 验收证据。
- [ ] 将不满足条件的主张降级、移除或转成单独修复任务。

核对时可打开：[相关 Codex 调研 task](codex://threads/019fe39f-048b-7310-8040-1255c6bdead9)。

## 5. 阅读过程中记录问题

每个问题至少记录：

- [ ] 文件和关键 symbol/section。
- [ ] 当前行为或当前文案。
- [ ] 不理解、冲突或风险是什么。
- [ ] 需要源码、真机、数据还是 owner 决策来确认。
- [ ] 是否影响上线主张。
- [ ] 是否需要建立独立修复任务。

先完成阅读和问题登记，再按问题边界创建后续任务。不要在通读过程中顺手展开大范围修改，导致阅读覆盖失控。

## 完成条件

- [ ] First-party 文档阅读清单达到 100%。
- [ ] First-party 代码阅读清单达到 100%。
- [ ] 所有跳过项都有明确理由。
- [ ] Owner 能解释主要产品入口、runtime 和数据真值。
- [ ] Landing Page 每项公开主张都有判决和证据状态。
- [ ] 发现的问题已经进入独立任务、公开限制或明确关闭。
- [ ] 相关 Codex 调研链接仍可从本任务直接打开。

## 不要做

- 不让 Codex/Claude 的总结代替 owner 阅读原文。
- 不把相关 Codex session 当成当前源码真值。
- 不逐行阅读第三方依赖、生成 bundle 或二进制资产。
- 不在通读过程中无边界地顺手改代码。
- 不把“文件已打开”当成“已经理解”。
