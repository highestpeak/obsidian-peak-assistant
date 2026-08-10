# Command Palette Governance

## TL;DR

Obsidian Command Palette 是稳定的产品级全局导航，不是功能开发期间的临时入口集合。生产版本只允许 owner 明确批准的全局入口；feature-local、Work Intelligence、maintenance、debug、QA、实验性和一次性动作必须留在所属 surface。

## Why

过去不同功能波次为了快速调试、验收或补一个可达入口，直接在 `main.ts` 追加 `this.addCommand(...)`。Hub curation、Related Notes、Copilot Command Center、TTS、封面生成、debug trace 和 component gallery 因此被扁平化到同一层 Palette。

这些动作并不属于同一种用户心智：

- Hub、Related Notes 和 review history 属于 Work Intelligence。
- TTS、cover image 属于媒体生成 workflow。
- Debug trace、component gallery 属于开发与 QA。
- 旧 Copilot Command Center 属于实验性 planner surface；新策展启动器尚未实现，也尚未进入批准清单。

如果没有清晰的准入和退场规则，临时入口会永久残留，只能依靠 owner 人工发现。这里改为“产品规则 + 单一清单 + 自动测试”，不再把清理责任转嫁给 owner。

## Approved Production Surface

当前 owner-approved Command Palette 只有以下十三项，顺序也属于产品清单：

1. `Open Peak Command Center`
2. `Open AI Control Center`
3. `Open My Content`
4. `Open Peak Sheet`
5. `Create Peak Sheet`
6. `Settings`
7. `Setup Wizard`
8. `Quick Search`
9. `Open File Atlas`
10. `Usage Dashboard`
11. `Open Chat Studio`
12. `Open document in Peak Composer`
13. `Show keyboard map`

`Show keyboard map` 是唯一批准的键盘帮助入口。`Focus Vault Search`、
`Focus AI Search`、`Focus File Atlas`、`Focus Chat Studio`、`Focus next zone`、
`Focus previous zone` 和 `Return to last Peak focus` 属于 surface-local 导航动作，
不得注册为全局 Obsidian command。`F6`、`Shift+F6` 和 `?` 由 Peak surface 的
键盘运行时直接处理，不依赖这些全局命令。

代码唯一真值是：

- `src/app/commands/gateway/manifests.ts` → `PALETTE_COMMAND_MANIFESTS`
- `src/app/commands/gateway/composeCommandGatewayBindings.ts` → gateway bindings

`main.ts` 只能遍历 gateway bindings 注册命令，不得在循环外追加生产 `this.addCommand(...)`。

产品需要新增或替换全局入口时，必须由 owner 明确批准，并在同一变更中更新本清单、manifest/binding 和精确 allowlist 测试。实现某个功能本身不代表它自动获得全局入口资格。

## Do

### 把动作放回所属 surface

- Work Intelligence 动作放在 Work Intelligence panel、context action 或 agent workflow。
- 文档局部动作放在 active-note toolbar、context menu、slash menu 或 Composer action。
- Maintenance 放在 `Settings → Advanced → Maintenance`。
- Debug / QA 通过测试、fixture script、development-only harness 或明确的非生产入口调用。
- surface-local 键盘导航由所属 surface 直接处理，不为改键便利重复注册全局命令。
- 用户可发现性不足时，先修所属 surface 的导航，不要直接用 Command Palette 补洞。

### 临时入口必须同时定义退场

确需临时命令时，创建时必须同时满足：

1. 明确标记用途：debug、QA、migration 或短期诊断。
2. 默认不进入 production build；使用 development-only gate 或独立脚本。
3. 写明 owner、移除条件和最晚移除的 milestone。
4. 对应 feature 完成或替代 surface 上线时，在同一波次删除注册、manifest、binding、快捷键和过时测试。

如果做不到这四点，就不要注册临时命令。

### 交付前自动验证

任何改动 `main.ts`、`src/app/commands/**` 或新增用户入口的任务，至少运行：

```bash
npm run test -- test/command-gateway-wire-in.test.ts
npm run build
```

`test/command-gateway-wire-in.test.ts` 必须：

- 精确断言 owner-approved command id allowlist，而不是只验证 manifest 与 binding 彼此一致。
- 断言 `main.ts` 只有 gateway binding loop 一个 `this.addCommand(...)` 注册点。
- 新增未批准命令时失败。

## Don't

```ts
// ❌ 为了方便开发或临时可达，直接污染生产 Palette
this.addCommand({
	id: 'peak-debug-something',
	name: 'Debug Something',
	callback: runDebugAction,
});
```

```ts
// ❌ feature 完成后只留下命令，等待 owner 日后发现并要求清理
this.addCommand({
	id: 'peak-work-intelligence-internal-step',
	name: 'Run Intelligence Internal Step',
	callback: runInternalStep,
});
```

```ts
// ❌ 测试只比较两个动态列表；两边同时误加命令仍会通过
assert.deepStrictEqual(bindingIds, manifestIds);
```

不要因为以下理由把动作放进 Palette：

- “暂时没有别的入口”
- “方便 QA”
- “方便我调试”
- “以后可能有人用”
- “实现已经存在，顺便暴露一下”

这些理由说明动作需要更合适的所属 surface、测试 harness 或退场计划，不构成全局入口资格。

## Checklist

修改命令或新增功能时逐项检查：

- [ ] 这是 owner 明确批准的稳定全局入口吗？
- [ ] 它是否其实属于 Work Intelligence、Composer、active note、Settings、debug 或 QA？
- [ ] 是否误把“功能需要可达”偷换成“必须进 Command Palette”？
- [ ] `PALETTE_COMMAND_MANIFESTS` 是否仍然只包含批准清单？
- [ ] `main.ts` 是否仍然只有 gateway binding loop 一个生产注册点？
- [ ] 临时入口是否 production-disabled，并写明 owner、移除条件和 milestone？
- [ ] feature 完成时是否同步清掉临时注册、manifest、binding、快捷键和过时测试？
- [ ] `test/command-gateway-wire-in.test.ts` 是否通过？
- [ ] `npm run build` 是否通过？
