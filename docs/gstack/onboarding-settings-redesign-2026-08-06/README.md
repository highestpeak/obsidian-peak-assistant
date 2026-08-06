# Onboarding 与 Settings 上线准备 mock

状态：design only · production unchanged · interaction not verified in Obsidian。

入口：

- `index.html`：视觉 review board；
- `start-variants.html`：Onboarding 第一步的三种结构候选；
- `onboarding.html`：五阶段可点击 Onboarding；
- `settings.html`：Standard / Advanced 分层 Settings，包含 6 组、18 个模型 assignment；
- `provider-picker.html`：Settings 内共享 task-model drawer 的 focused component review，不是独立产品页面；
- `screens/`：本地验证时由 Playwright 生成的主画面快照；按仓库规则不提交。

对应设计说明：

- `docs/superpowers/specs/2026-08-06-onboarding-settings-launch-readiness-redesign.md`

验证方式：

```bash
node docs/gstack/onboarding-settings-redesign-2026-08-06/verify.mjs
```
