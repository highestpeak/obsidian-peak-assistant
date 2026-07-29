import assert from 'assert';
import { readFileSync } from 'fs';
import { DEFAULT_COMPOSER_CONFIG } from '@/ui/view/composer/config/composerConfig';

const toolbar = readFileSync(
	'src/ui/view/composer/chrome/SelectionToolbar.tsx',
	'utf8',
);
const css = readFileSync('src/styles/composer.css', 'utf8');
const template = JSON.parse(
	readFileSync('templates/config/composer.json', 'utf8'),
);

const fallbackSelection = DEFAULT_COMPOSER_CONFIG.chrome.selection;
const templateSelection = template.chrome.selection;
const rejectedSemanticLabels = new Set(['重点', '定义', '资料', '想法', '风险']);

assert.equal(fallbackSelection.customColor, '自定义颜色');
assert.equal(templateSelection.customColor, '自定义颜色');
assert.equal(fallbackSelection.quickTextColors?.length, 3);
assert.equal(templateSelection.quickTextColors?.length, 3);
assert.equal(fallbackSelection.quickHighlightColors?.length, 3);
assert.equal(templateSelection.quickHighlightColors?.length, 3);
assert.equal(fallbackSelection.textColors.length, 6);
assert.equal(templateSelection.textColors.length, 6);
assert.equal(fallbackSelection.highlightColors.length, 5);
assert.equal(templateSelection.highlightColors.length, 5);
assert.equal(
	fallbackSelection.scopeTemplates.crossParagraph,
	'跨 {n} 个块 · {fragments} 个片段',
);
assert.equal(
	templateSelection.scopeTemplates.crossParagraph,
	'跨 {n} 个块 · {fragments} 个片段',
);
assert.equal(
	fallbackSelection.scopeTemplates.crossBlock,
	'跨 {n} 个块 · {fragments} 个片段',
);
assert.equal(
	templateSelection.scopeTemplates.crossBlock,
	'跨 {n} 个块 · {fragments} 个片段',
);
assert.deepEqual(
	fallbackSelection.quickTextColors?.map((swatch) => swatch.value),
	['#b42318', '#2563eb', '#16845f'],
);
assert.deepEqual(
	templateSelection.quickTextColors?.map((swatch: { value: string }) => swatch.value),
	['#b42318', '#2563eb', '#16845f'],
);
assert.deepEqual(
	fallbackSelection.quickHighlightColors?.map((swatch) => swatch.value),
	['#fff1a8', '#dff4e8', '#fde4e4'],
);
assert.deepEqual(
	templateSelection.quickHighlightColors?.map((swatch: { value: string }) => swatch.value),
	['#fff1a8', '#dff4e8', '#fde4e4'],
);
assert.equal(
	fallbackSelection.highlightColors.some((swatch) =>
		rejectedSemanticLabels.has(swatch.label),
	),
	false,
);
assert.equal(
	templateSelection.highlightColors.some((swatch: { label: string }) =>
		rejectedSemanticLabels.has(swatch.label),
	),
	false,
);

assert.match(toolbar, /className="pk-selection-swatch__color"/);
assert.match(toolbar, /type="color"/);
assert.match(toolbar, /className="pk-selection-text-color-icon"/);
assert.match(toolbar, /className="pk-selection-quick-colors"/);
assert.match(toolbar, /className="pk-selection-quick-color"/);
assert.match(toolbar, /data-quick-color-kind="text"/);
assert.match(toolbar, /data-quick-color-kind="highlight"/);
assert.match(toolbar, /data-quick-text-color=\{swatch\.value\}/);
assert.match(toolbar, /data-quick-highlight-color=\{swatch\.value\}/);
assert.match(toolbar, /\.replaceAll\('\{fragments\}', String\(fragments\)\)/);
assert.match(
	toolbar,
	/onClick=\{\(\) => void applyFormat\('text-color', swatch\.value\)\}/,
);
assert.match(
	toolbar,
	/onClick=\{\(\) => void applyFormat\('highlight', swatch\.value\)\}/,
);
assert.doesNotMatch(toolbar, /\bBaseline,/);
assert.doesNotMatch(toolbar, /<i>\{swatch\.label\}<\/i>/);
assert.match(
	css,
	/\.pk-selection-panel\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?top:\s*calc\(100% \+ 7px\);/,
);
assert.match(
	css,
	/\.pk-selection-swatch__color\s*\{[\s\S]*?width:\s*24px;[\s\S]*?height:\s*24px;[\s\S]*?border-radius:\s*50%;/,
);
assert.match(
	css,
	/\.pk-selection-quick-color\s*\{[\s\S]*?width:\s*18px\s*!important;[\s\S]*?height:\s*28px\s*!important;/,
);
assert.match(
	css,
	/\.pk-selection-quick-color__dot\s*\{[\s\S]*?width:\s*10px;[\s\S]*?height:\s*10px;[\s\S]*?border-radius:\s*50%;/,
);
assert.match(
	css,
	/\.pk-selection-text-color-icon__bar\s*\{[\s\S]*?display:\s*flex;[\s\S]*?height:\s*3px;/,
);
assert.match(
	css,
	/\[data-has-selection\] \.pk-composer-editable:focus-visible\s*\{[\s\S]*?box-shadow:\s*none;/,
);
assert.doesNotMatch(css, /\.pk-selection-swatch::before/);

console.log('composer-selection-color-picker: 39/39 checks passed');
