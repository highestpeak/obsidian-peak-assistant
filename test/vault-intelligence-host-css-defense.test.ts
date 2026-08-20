import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync('src/styles/peak-components.css', 'utf8');

function rule(selector: string): string {
	const start = css.indexOf(`${selector} {`);
	assert.ok(start >= 0, `missing CSS rule: ${selector}`);
	const end = css.indexOf('\n}', start);
	assert.ok(end >= 0, `unterminated CSS rule: ${selector}`);
	return css.slice(start, end + 2);
}

const baseButton = rule('.peak-vault-intelligence-view .pk-btn');
assert.match(baseButton, /border:\s*1px solid transparent !important;/);
assert.match(baseButton, /border-radius:\s*5px !important;/);
assert.match(baseButton, /font-size:\s*12px !important;/);
assert.match(baseButton, /line-height:\s*1\.25 !important;/);
assert.match(baseButton, /background:\s*transparent !important;/);

const activityMode = rule('.peak-vault-intelligence-view .pk-vi-activity-mode-switch > .pk-btn');
assert.match(activityMode, /border:\s*0 !important;/);
assert.match(activityMode, /border-radius:\s*6px !important;/);
assert.match(activityMode, /font-size:\s*11px !important;/);

const activityToolbar = rule('.peak-vault-intelligence-view .pk-vi-activity-toolbar > div > .pk-btn');
assert.match(activityToolbar, /border:\s*1px solid var\(--pk-vi-border\) !important;/);
assert.match(activityToolbar, /border-radius:\s*999px !important;/);
assert.match(activityToolbar, /font-size:\s*9\.5px !important;/);

const rangeHandle = rule('.peak-vault-intelligence-view .pk-vi-activity-range-window > .pk-btn');
assert.match(rangeHandle, /top:\s*0;/);
assert.match(rangeHandle, /bottom:\s*0;/);
assert.match(rangeHandle, /margin:\s*auto 0;/);
assert.doesNotMatch(rangeHandle, /transform:/, 'range handles must not depend on a transform that the host reset clears');
assert.match(rangeHandle, /background:\s*#6755c5 !important;/);

const scopeOption = rule('.peak-vault-intelligence-view .pk-vi-scope-mode-options > .pk-btn');
assert.match(scopeOption, /justify-content:\s*space-between !important;/);
assert.match(scopeOption, /border:\s*1px solid var\(--pk-vi-border\) !important;/);
assert.match(scopeOption, /background:\s*#fff !important;/);

const categoryOption = rule('.peak-vault-intelligence-view .pk-vi-scan-check-grid > .pk-btn');
assert.match(categoryOption, /border-radius:\s*9px !important;/);
assert.match(categoryOption, /background:\s*#fff !important;/);

const trustRow = rule('.peak-vault-intelligence-view .pk-vi-scan-trust-row');
assert.match(trustRow, /display:\s*flex;/);
assert.match(trustRow, /gap:\s*24px;/);
assert.match(trustRow, /padding:\s*9px 16px;/);

const scopeBuilder = rule('.peak-vault-intelligence-view .pk-vi-scope-builder');
assert.match(scopeBuilder, /overflow:\s*visible;/);
assert.match(scopeBuilder, /border-top:\s*1px solid var\(--pk-vi-border\);/);
assert.doesNotMatch(scopeBuilder, /border-radius:/);
assert.match(rule('.peak-vault-intelligence-view .pk-vi-scope-selected-row'), /display:\s*none;/);
assert.match(rule('.peak-vault-intelligence-view .pk-vi-scope-builder-foot'), /display:\s*none;/);

const aiGroup = rule('.peak-vault-intelligence-view .pk-vi-scan-ai-group-row.pk-btn');
assert.match(aiGroup, /grid-template-columns:\s*minmax\(0, 1fr\) 142px 22px;/);
assert.match(aiGroup, /border:\s*0 !important;/);
assert.match(aiGroup, /background:\s*#fff !important;/);
assert.match(css, /\.pk-vi-scan-ai-group-row > span:nth-child\(2\)\s*\{\s*display:\s*none;\s*\}/);
assert.match(css, /\.pk-vi-scan-ai-group-row > span:nth-child\(3\) small\s*\{\s*display:\s*none;\s*\}/);

assert.doesNotMatch(
	css,
	/^:is\(\.pktw-root, \.peak-design-root\) small\s*\{/m,
	'settings/onboarding typography must not leak into every peak-design-root surface',
);
assert.match(css, /:is\(\.pktw-root, \.peak-design-root\) \.pk-settings-root small,/);
assert.match(css, /:is\(\.pktw-root, \.peak-design-root\) \.pk-onboarding small/);

console.log('vault-intelligence-host-css-defense: passed');
