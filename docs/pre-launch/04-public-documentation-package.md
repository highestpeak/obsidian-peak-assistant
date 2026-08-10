# 04 · README 与公开文档包

> [返回上线前 TODO](../pre-launch-todo.md)
>
> 优先级：P0 · 上线闸门
>
> 状态：未开始
>
> 前置任务：[公开仓库边界与英文化](03-public-repository-and-english.md)、[English Default 与多语言配置收口](18-english-default-and-i18n-closure.md)

## 任务目标

建立一套面向用户、贡献者和维护者的英文公开文档。README 只承担定位、安装和导航，不承载所有详细说明。

## 1. README

- [ ] 一句话产品定位与目标用户。
- [ ] 当前真实可用的核心能力。
- [ ] 安装、首次配置和快速开始。
- [ ] Provider、API key、费用和数据发送边界。
- [ ] 平台支持、已知限制和项目状态。
- [ ] 演示视频或截图。
- [ ] 公开文档、问题反馈和贡献入口。
- [ ] License、隐私和安全说明入口。

## 2. 用户文档

- [ ] 安装与升级。
- [ ] 首次启动和 Provider 配置。
- [ ] 每项公开功能的详细说明。
- [ ] 常见工作流和功能间 handoff。
- [ ] 故障排查和 FAQ。
- [ ] 已知限制和支持范围。
- [ ] 数据存储、同步、删除和恢复说明。
- [ ] Provider 请求内容、成本和隐私边界。

每项功能说明至少回答：

- [ ] 什么时候使用。
- [ ] 从哪里进入。
- [ ] 需要什么前置配置。
- [ ] 如何完成主要任务。
- [ ] 成功结果是什么。
- [ ] 失败后如何恢复。
- [ ] 会读取、写入或发送什么数据。

## 3. 数据与 SQL 文档

SQL 表说明不能暗示 SQLite 是所有数据的事实源。文档必须同时说明：

- [ ] 每类数据的 canonical carrier。
- [ ] JSON/JSONL 的 owner、路径、生命周期和同步策略。
- [ ] SQLite 数据库的用途。
- [ ] 每张公开相关表的关键字段和关系。
- [ ] 每张表的写入方和读取方。
- [ ] 哪些表属于可重建 projection。
- [ ] 哪些表属于索引、缓存或 telemetry。
- [ ] schema 版本、迁移和 quarantine 规则。
- [ ] 数据保留、删除和恢复规则。
- [ ] 哪些数据会进入 Peak knowledge index。
- [ ] 哪些内容可能发送给外部 AI Provider。

当前数据治理以 [Generated Artifact Registry](../conventions/generated-artifact-registry.md) 为准。

## 4. 贡献指南

- [ ] 开发环境和安装依赖。
- [ ] 本地启动、构建和 reload。
- [ ] 目录结构和四层架构边界。
- [ ] focused tests、全量测试和 TypeScript 检查。
- [ ] 真实 Obsidian QA 流程。
- [ ] 代码、配置、模板、UI 和持久化规则。
- [ ] Issue、branch、commit 和 Pull Request 流程。
- [ ] 如何添加 Provider、功能和命令。
- [ ] 如何添加持久化 writer。
- [ ] 如何添加公共按钮组件。
- [ ] 隐私、安全和测试 fixture 规则。
- [ ] 哪些内部/private 文档不能进入公开仓库。

## 5. 支持与发布文档

- [ ] Troubleshooting。
- [ ] FAQ。
- [ ] Changelog。
- [ ] Release notes。
- [ ] 升级和迁移说明。
- [ ] 已知问题和限制。
- [ ] 安全问题报告方式。
- [ ] 数据删除与支持联系方式。

## 完成条件

- [ ] 新用户只依靠 README 和公开文档就能完成第一次成功使用。
- [ ] 新贡献者不依赖私聊即可构建、测试并提交小改动。
- [ ] 文档描述与当前 Release Candidate 一致。
- [ ] spec、mock、source inspection 和测试没有被描述成已发布行为。

## 不要做

- 不把 README 写成完整产品手册。
- 不把内部模块名当成用户文档标题。
- 不复用旧私有文档目录作为公开导航。
