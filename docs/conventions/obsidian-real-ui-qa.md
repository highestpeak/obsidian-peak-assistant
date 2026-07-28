# Obsidian 真机调试与交互验收

## TL;DR

Obsidian 的精确状态建立、DOM 检查、鼠标与键盘交互必须由 Chrome DevTools Protocol（CDP）+ Playwright 完成；Computer Use 只负责最终可见证据，不能作为 CDP 失败后的盲点控制器。无法建立确定性控制链时应停止并标记未验证，不得用重复点击、猜快捷键或静态截图冒充交互验收。

## Why

Obsidian 的 accessibility tree（AX tree）对 Composer 这类自定义 React surface 不够完整。依赖 AX 序号、坐标点击或截图猜测状态，会产生四类系统性问题：

- 元素序号在每次渲染后变化，操作目标不可复现。
- reload、tab 和 transient surface 会改变焦点，后续动作可能落到错误窗口。
- 点击固定菜单只能证明 click path，不能证明 hover corridor、焦点恢复或 Escape path。
- 大量中间截图记录了操作过程，却没有提供 DOM、几何或事件证据。

本规约的目标是让每一次真机结论都能回答：使用了哪一版源码、建立了什么状态、执行了什么真实动作、观察到了什么证据，以及哪些行为仍未验证。

## 工具所有权

| 工具 | 负责 | 不负责 |
| --- | --- | --- |
| Obsidian CDP + Playwright | 插件重载、命令执行、DOM 查询、computed style、bounding box、滚动锚点、焦点、pointer/keyboard flow、运行时断言 | OS 级可见结果证明 |
| DevTools Console | CDP 暂不可用时执行一次确定性的 Obsidian API reload/open 命令，辅助查看 DOM | 代替完整交互自动化，或通过反复手输命令试错 |
| Computer Use | 证明结果来自真实 Obsidian；最终截图；必须依赖 OS 观察的短录屏 | AX 序号导航、内部控件定位、插件重载、命令面板试错、设置页开关 |
| Harness / static mock | 快速表征、设计参考、稳定 fixture | 生产 Obsidian 验收 |

Computer Use 不是 CDP 的降级控制器。没有 CDP 时，允许降低验收结论的等级，不允许降低操作精度后继续宣称完整通过。

## 最短可靠流程

### 1. Preflight

1. 确认用户当前没有操作 Obsidian。
2. 记录目标 Vault 文件、源码 SHA、viewport、DPR、theme、zoom、scroll anchor 和目标交互状态。
3. 发现当前 CDP 端口，不得硬编码：

```bash
lsof -nP -iTCP -sTCP:LISTEN | rg '^Obsidian'
```

4. 连接 `app://obsidian.md/index.html`，确认选中的 page 是主 renderer，不是 DevTools page。

如果工具报告用户改变了 Obsidian 状态，立即停止自动操作并重新取得用户许可或等待用户完成；不要抢回焦点。

### 2. Build and plugin-only reload

先完成 focused test 和 production build。之后只重载当前插件：

```js
await page.evaluate(async () => {
  const pluginId = 'obsidian-peak-assistant';
  await app.plugins.disablePlugin(pluginId);
  await app.plugins.enablePlugin(pluginId);
});

await page.waitForFunction(() =>
  Boolean(
    app.commands.commands[
      'obsidian-peak-assistant:peak-open-document-composer'
    ],
  ),
);
```

普通插件 QA 禁止使用以下路径：

- 猜测 `Cmd+R`、`Cmd+P` 或其他快捷键；
- 打开 Settings → Community plugins 反复切换；
- 执行 `Reload app without saving`；
- 依赖 Computer Use 点击 reload 控件。

完整 app reload 只用于已经确认的 renderer 级问题，并且必须先说明影响和恢复路径。

### 3. Deterministic state setup

插件 reload 后，使用稳定 selector 和 command id 恢复目标状态：

```js
await page.locator(
  '.workspace-tab-header[data-type="markdown"][aria-label="Peak Composer Visual Parity QA"]',
).click();

await page.evaluate(() =>
  app.commands.executeCommandById(
    'obsidian-peak-assistant:peak-open-document-composer',
  ),
);

await page.locator('.peak-composer-root').waitFor({ state: 'visible' });
```

不要使用动态 AX 序号或坐标寻找内部 Composer 控件。每次实质性交互后重新读取 DOM 状态，不复用旧 locator 结果推断新状态。

### 4. Verify the exact interaction class

验收动作必须与声明一致：

| 声明 | 最低证据 |
| --- | --- |
| 菜单位置、尺寸、左对齐或无覆盖 | DOM bounding box + computed style + 最终真实截图 |
| hover 后出现 | Playwright `hover()` 或真实 pointer move 后的 DOM 状态 |
| 鼠标可从 trigger 移到 menu | pointer 按实际路径跨过间隙；menu 在路径结束后仍 visible |
| click 后固定 | click 后 pinned/data-state 断言；pointer 移出 trigger 后仍 visible |
| Escape / outside click 关闭 | 真实 keyboard/pointer flow + focus/DOM 断言 |
| focus trap / focus restoration | activeElement 前后对比 |
| Undo / Redo / History 顺序 | 短视频或逐步 runtime/DOM 状态记录 |

不能用 click path 代替 hover path，不能用最终静态截图证明中间状态。动态行为如果没有可执行的 pointer/keyboard 工具，应标记为 `INTERACTION NOT VERIFIED`，或由用户手动执行并明确记录为 `OWNER-CONFIRMED`。

### 5. Visual proof

在 DOM 和交互断言通过后，Computer Use 只做最终可见证据：

- 静态外观通常一张最终截图；
- hover corridor、drag、IME、History sequence 等动态行为使用一段短录屏；
- 只有最终状态错误且 DOM 无法解释时才增加二分截图。

不要为“菜单打开”“命令已输入”“设置页已到达”等正常中间步骤截图。

## No-CDP fallback

CDP 不可用时先检查是否已经有可用的 Obsidian DevTools Console。DevTools 只允许执行一次确定性 reload/open：

```js
void (async () => {
  const pluginId = 'obsidian-peak-assistant';
  await app.plugins.disablePlugin(pluginId);
  await app.plugins.enablePlugin(pluginId);
  await app.commands.executeCommandById(
    'obsidian-peak-assistant:peak-open-document-composer',
  );
})();
```

该 fallback 可以证明新 bundle 被加载，但不能自动证明 hover、drag、focus 或 keyboard flow。无法重新取得 CDP 时：

1. 完成源码、测试和 build 验证；
2. 允许 Computer Use 获取一张当前真实界面；
3. 将精确交互标记为未验证，或等待用户手动确认；
4. 不继续猜快捷键、AX 序号、坐标或 reload 路径。

## Stop rules

出现以下任一情况必须停止当前自动化链：

- 工具报告用户改变了目标 app；
- 当前 page 是 DevTools，而不是 Obsidian 主 renderer；
- source revision、viewport、scroll anchor 或 interaction state 与基准不一致；
- 一次恢复动作产生了意外 leaf/window 后仍无法用 DOM 解释；
- 同一自动化 transition 连续失败两次；
- 当前工具无法执行被声明的交互类型。

停止后应保留已确认的源码/测试证据，并将真机结论标记为 `NOT COMPARABLE` 或 `INTERACTION NOT VERIFIED`。不要用更多点击掩盖状态漂移。

## Don't

- 不使用 AX element index 作为 Composer 内部控件的稳定标识。
- 不连续尝试多个 reload 方法。
- 不在用户操作 Obsidian 时继续抢焦点。
- 不把“看起来正确”写成“交互已通过”。
- 不把 click 固定状态当成 hover corridor 证据。
- 不用大量中间截图替代 DOM 和事件证据。
- 不在无法复现相同状态时继续改 CSS。

## Reporting contract

最终报告按证据层分别陈述：

- `SOURCE VERIFIED`：源码与测试覆盖了预期状态机。
- `BUILD VERIFIED`：production bundle 构建通过。
- `DOM VERIFIED`：真实 Obsidian 的 DOM、geometry 或 computed style 通过。
- `INTERACTION VERIFIED`：目标 pointer/keyboard 路径真实执行并通过。
- `VISUAL VERIFIED`：Computer Use 最终截图或短视频通过。
- `OWNER-CONFIRMED`：用户亲自执行并确认，但自动化未覆盖。
- `NOT VERIFIED`：缺少对应证据。

只有与声明相关的层全部通过，才可以使用“真实 Obsidian 验收通过”。例如 hover bug 必须至少达到 `DOM VERIFIED + INTERACTION VERIFIED`；一张打开菜单的截图不够。

## Checklist

- [ ] 目标 page 是 Obsidian 主 renderer，不是 DevTools。
- [ ] 用户当前没有操作目标 app。
- [ ] source SHA、viewport、scroll anchor 和状态已经锁定。
- [ ] 使用 CDP/Playwright 建立状态和执行交互。
- [ ] 只做 plugin-only reload。
- [ ] locator 来自 DOM selector，不是 AX 序号或坐标。
- [ ] 验收动作与最终声明属于同一种 interaction class。
- [ ] 动态行为有真实 pointer/keyboard 证据。
- [ ] Computer Use 只承担最终可见证据。
- [ ] 没有无意义的中间截图。
- [ ] 失败次数和 stop rule 没有被绕过。
- [ ] 最终报告按证据层标明已验证与未验证。
