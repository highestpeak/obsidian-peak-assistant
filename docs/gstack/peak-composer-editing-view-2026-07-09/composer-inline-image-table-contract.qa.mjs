import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("./", import.meta.url);
const [html, css, js] = await Promise.all([
  readFile(new URL("index.html", root), "utf8"),
  readFile(new URL("mock.css", root), "utf8"),
  readFile(new URL("mock.js", root), "utf8"),
]);

const formatExamples = [
  ["strong", "加粗"],
  ["em", "斜体"],
  ["is-underlined", "下划线"],
  ["del", "删除线"],
  ["mark", "黄色标记"],
  ["is-colored", "文字颜色"],
  ["format-suggestion-token", "AI 样式建议"],
];

formatExamples.forEach(([needle, label]) => {
  assert.match(html, new RegExp(needle), `示例文档应包含${label}`);
});
assert.match(html, /data-format-source=/, "行内样式必须暴露可回到 Markdown / HTML 的源语法");
assert.match(html, /data-ai-style=/, "普通词语可以携带可预览的 AI 样式建议");
assert.match(js, /function initFormatTokenPopover\(\)/, "行内样式悬浮卡必须初始化");
assert.match(css, /\.format-token:hover[\s\S]*?box-shadow:/, "行内样式在 hover 时必须有可见反馈");

assert.equal((html.match(/data-image-layout="/g) || []).length, 4, "图片组合应提供四种布局");
assert.match(html, /data-block-kind="image-layout"/, "多图组合必须是一个独立 HTML Block");
assert.match(html, /Markdown Preview 可见/, "多图组合必须说明 Markdown Preview 可渲染");
assert.match(js, /function imageLayoutSource\(layout\)/, "切换布局必须同步权威 HTML source");
assert.match(js, /switch-image-layout/, "图片布局按钮必须接入统一动作处理");
["grid", "hero", "strip", "story"].forEach((layout) => {
  assert.match(css, new RegExp(`data-layout="${layout}"`), `${layout} 图片布局必须有真实样式`);
});

assert.match(js, /event\.metaKey \|\| event\.ctrlKey/, "⌘ / Ctrl 点击必须进入不连续单元格选择");
assert.match(js, /function toggleTableCellSelection\(cell\)/, "不连续单元格选择必须有独立 toggle 状态");
assert.match(js, /function pointHitsTableCellText\(cell, x, y\)/, "表格必须区分文字拖选与单元格框选");
assert.match(js, /nativeSelectionInsideTableCell/, "原生文字选区不能被单元格 click 覆盖");
assert.match(html, /data-selection-table-action="merge"/, "单元格浮动菜单必须恢复合并入口");
assert.match(html, /data-selection-table-action="clear"/, "不连续选区必须能一键清除");
assert.match(js, /function mergeableTableSelection\(cells = selectedTableCells\)/, "合并能力必须由完整矩形判定");
assert.match(js, /当前是不连续选区；补齐矩形中的空缺单元格后即可合并/, "不完整选择必须解释为何暂时不能合并");
assert.match(css, /\.composer-table td\.is-discrete-cell/, "不连续选择必须有独立视觉边界");

console.log("Composer inline style, image layout and table selection contracts passed.");
