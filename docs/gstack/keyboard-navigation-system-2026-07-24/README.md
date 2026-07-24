# Peak Keyboard Navigation System

日期：2026-07-24  
状态：**Design only / not implemented**

这个目录是 Peak Assistant 五工作区全键盘导航的视觉解释层。

## Authority

| 需要 | 阅读入口 |
|---|---|
| 决定最终键盘行为、zone 顺序、焦点与冲突规则 | [正式设计规格](../../superpowers/specs/2026-07-24-peak-keyboard-navigation-system.md) |
| 核查学术、产业、公开用户反馈与当前产品证据 | [研究报告](../../research/2026-07-24-peak-keyboard-navigation/README.md) |
| 快速理解整体心智模型和五工作区导航地图 | [视觉报告](./index.html) |

冲突时，正式设计规格是 target authority；生产源码是 current behavior authority；本 HTML 只负责帮助 owner 审阅和记忆，不证明功能已实现。

## 核心设计

```text
F6 / Shift+F6     切工作区区域
Tab / Shift+Tab   切区域内组件
方向键             切组件内元素
Enter / Space     打开、执行、选择、切换
Shift+F10         当前元素完整动作
Alt/Option+F10    从 Composer 选区进入浮动工具栏
Escape            退一层并恢复焦点
?                 当前上下文键盘地图
```

## 打开

直接打开 [index.html](./index.html)，或在仓库根目录运行：

```bash
python3 -m http.server 8173
```

然后访问：

```text
http://127.0.0.1:8173/docs/gstack/keyboard-navigation-system-2026-07-24/index.html
```

## 验证

```bash
node docs/gstack/keyboard-navigation-system-2026-07-24/validate.mjs
```

验证覆盖：

- HTML 必要 landmarks、anchor 和五个 surface map；
- Composer selection toolbar 的 `Alt/Option+F10 → arrows → Enter/Space → Escape` 路径；
- design-only 状态与排除范围；
- 键盘核心语法；
- 外部研究链接；
- 横向溢出、focus-visible 和窄屏布局；
- 1728×1000 与 1024×768 截图。

聚焦预览：[Composer selection toolbar](./preview-composer-selection-toolbar.png)。
