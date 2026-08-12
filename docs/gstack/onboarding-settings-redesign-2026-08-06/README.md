# Onboarding 与 Settings 历史设计探索

状态：superseded historical exploration · design only · production unchanged。

当前评审与后续实现请从 [`2026-08-12 Settings and Onboarding design package`](../settings-onboarding-unified-2026-08-12/index.html) 开始。这里保留早期流程、Provider picker、Settings variants 和视觉校准证据，但不再是当前设计依据。

历史入口：

- `index.html`：视觉 review board；
- `start-variants.html`：Onboarding 第一步的三种结构候选；
- `onboarding.html`：五阶段可点击 Onboarding；
- `settings-variants.html`：四种不依赖左侧栏的 Settings 外壳探索；每次显示一个完整方案；
- `settings-research.html`：Raycast、VS Code、Linear 与 JetBrains Settings 模式研究；
- `settings-native.html`：调研后收敛的原生工具窗口方向；前四个 variant 已否决；
- `settings.html`：固定七分类的 Settings v3；没有全局 Standard / Advanced，低频设置在所属页面展开，运行级控制集中到 Developer；
- `provider-picker.html`：Settings 内共享 task-model drawer 的 focused component review，不是独立产品页面；
- `screens/`：本地验证时由 Playwright 生成的主画面快照；按仓库规则不提交。

对应设计说明：

- `docs/superpowers/specs/2026-08-06-onboarding-settings-launch-readiness-redesign.md`

静态检查：

```bash
node --check docs/gstack/onboarding-settings-redesign-2026-08-06/mock.js
node --check docs/gstack/onboarding-settings-redesign-2026-08-06/settings-variants.js
node --check docs/gstack/onboarding-settings-redesign-2026-08-06/settings-native.js
node --check docs/gstack/onboarding-settings-redesign-2026-08-06/verify.mjs
```

浏览器交互验证：

```bash
node docs/gstack/onboarding-settings-redesign-2026-08-06/verify.mjs
```
