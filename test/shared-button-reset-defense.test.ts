import assert from 'assert';
import { readFileSync } from 'fs';

const resetCss = readFileSync('src/styles/obsidian-reset.css', 'utf8');
const primitiveCss = readFileSync('src/styles/peak-components.css', 'utf8');
const fileAtlasCss = readFileSync('src/styles/file-atlas.css', 'utf8');
const composerCss = readFileSync('src/styles/composer.css', 'utf8');
const composerSidecarCss = readFileSync('src/styles/composer-sidecar.css', 'utf8');

assert.match(
	resetCss,
	/\.peak-design-root button\s*\{[\s\S]*?height:\s*auto !important;[\s\S]*?min-height:\s*0 !important;[\s\S]*?max-height:\s*none !important;/,
	'the guard must track the real Obsidian button reset contract',
);

/**
 * React primitives that render a <button>. Add a class here in the same change
 * that introduces a new public button primitive.
 */
const BUTTON_PRIMITIVE_CLASSES = [
	'.pk-btn',
	'.pk-icon-btn',
	'.pk-pill',
	'.pk-pop-item',
	'.pk-segmented__opt',
	'.pk-toggle',
	'.pk-result-browser-toolbar__option',
	'.pk-button-geometry',
] as const;

const DIMENSION_PROPERTIES = new Set([
	'width',
	'height',
	'min-width',
	'min-height',
	'max-width',
	'max-height',
]);

const RESET_NEUTRAL_VALUES = new Set([
	'0',
	'auto',
	'none',
	'100%',
]);

interface CssRule {
	selector: string;
	declarations: Array<{ property: string; value: string }>;
}

function parseRules(css: string): CssRule[] {
	const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
	return Array.from(withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)).map((match) => ({
		selector: match[1]!.trim(),
		declarations: match[2]!
			.split(';')
			.map((part) => {
				const colon = part.indexOf(':');
				if (colon < 0) return null;
				return {
					property: part.slice(0, colon).trim(),
					value: part.slice(colon + 1).trim(),
				};
			})
			.filter((entry): entry is { property: string; value: string } => entry !== null),
	}));
}

const textareaHeightResetRules = parseRules(resetCss).filter((rule) =>
	rule.selector.includes('.peak-design-root textarea') &&
	rule.declarations.some(({ property, value }) => property === 'height' && value === 'auto !important'),
);

assert.deepStrictEqual(
	textareaHeightResetRules,
	[],
	'textareas must not inherit the button-only height reset because native resize writes their height dynamically',
);

function targetsButtonPrimitive(selector: string): boolean {
	if (/\bsvg\b|\.icon\b|::before|::after/.test(selector)) return false;
	if (selector.includes('.pk-toggle__thumb')) return false;
	return BUTTON_PRIMITIVE_CLASSES.some((className) => selector.includes(className));
}

const violations: string[] = [];
for (const rule of parseRules(primitiveCss)) {
	if (!targetsButtonPrimitive(rule.selector)) continue;
	const fixedDimensions = rule.declarations.filter(({ property, value }) =>
		DIMENSION_PROPERTIES.has(property) &&
		!RESET_NEUTRAL_VALUES.has(value.replace(/\s*!important\s*$/, '').trim()),
	);
	if (fixedDimensions.length === 0) continue;

	for (const declaration of fixedDimensions) {
		if (declaration.value.includes('!important')) continue;
		violations.push(`${rule.selector} -> ${declaration.property}: ${declaration.value}`);
	}
	for (const declaration of rule.declarations.filter(({ property }) => property === 'padding')) {
		if (declaration.value.includes('!important')) continue;
		violations.push(`${rule.selector} -> padding: ${declaration.value}`);
	}
}

assert.deepStrictEqual(
	violations,
	[],
	[
		'Fixed-size public button primitives must defeat the peak-design-root reset.',
		'Add !important to effective dimensions and padding.',
		...violations,
	].join('\n'),
);

assert.match(
	primitiveCss,
	/\.pk-toggle__thumb\s*\{[\s\S]*?width:\s*16px;[\s\S]*?height:\s*16px;/,
	'Toggle must use a real thumb element because the design reset removes button pseudo-elements',
);

assert.match(
	primitiveCss,
	/:is\(\.pktw-root, \.peak-design-root\) \.pk-result-browser-toolbar__option\s*\{[\s\S]*?height:\s*32px !important;[\s\S]*?min-height:\s*32px !important;[\s\S]*?max-height:\s*32px !important;[\s\S]*?padding:\s*0 12px !important;/,
	'Result Browser options must use a scoped selector that beats the peak-design-root button reset',
);

assert.match(
	primitiveCss,
	/\.pk-command-access-toggle\.pk-btn\s*\{[\s\S]*?width:\s*144px !important;[\s\S]*?min-width:\s*144px !important;[\s\S]*?max-width:\s*144px !important;[\s\S]*?height:\s*28px !important;[\s\S]*?min-height:\s*28px !important;[\s\S]*?max-height:\s*28px !important;[\s\S]*?padding:\s*2px 0 !important;/,
	'Command Gateway access switch must keep its fixed alignment geometry under the reset',
);

assert.match(
	primitiveCss,
	/:is\(\.pktw-root, \.peak-design-root\) \.pk-button-geometry\s*\{[\s\S]*?width:\s*auto !important;[\s\S]*?min-width:\s*0 !important;[\s\S]*?max-width:\s*none !important;[\s\S]*?height:\s*var\(--pk-button-geometry-height\) !important;[\s\S]*?min-height:\s*var\(--pk-button-geometry-height\) !important;[\s\S]*?max-height:\s*var\(--pk-button-geometry-height\) !important;[\s\S]*?padding:\s*0 var\(--pk-button-geometry-padding-x\) !important;/,
	'shared Button fixed geometry must defeat the peak-design-root reset',
);

assert.match(
	primitiveCss,
	/:is\(\.pktw-root, \.peak-design-root\) \.pk-button-geometry\[data-geometry\$="-icon"\]\s*\{[\s\S]*?width:\s*var\(--pk-button-geometry-height\) !important;[\s\S]*?min-width:\s*var\(--pk-button-geometry-height\) !important;[\s\S]*?max-width:\s*var\(--pk-button-geometry-height\) !important;[\s\S]*?padding:\s*0 !important;/,
	'shared Button icon geometry must remain square under the reset',
);

assert.match(
	primitiveCss,
	/button\.pk-model-trigger\s*\{[\s\S]*?width:\s*100% !important;[\s\S]*?min-width:\s*0 !important;[\s\S]*?min-height:\s*44px !important;[\s\S]*?padding:\s*7px 10px !important;/,
	'model picker triggers must retain a readable hit target under the Obsidian reset',
);

assert.match(
	primitiveCss,
	/button\.pk-onboarding-provider-kind\s*\{[\s\S]*?width:\s*100% !important;[\s\S]*?min-width:\s*0 !important;[\s\S]*?min-height:\s*66px !important;[\s\S]*?padding:\s*10px 12px !important;/,
	'onboarding provider choices must remain large enough to scan and click',
);

assert.match(
	primitiveCss,
	/button\.pk-onboarding-provider-edit\s*\{[\s\S]*?width:\s*40px !important;[\s\S]*?min-width:\s*40px !important;[\s\S]*?max-width:\s*40px !important;[\s\S]*?height:\s*40px !important;[\s\S]*?min-height:\s*40px !important;[\s\S]*?max-height:\s*40px !important;[\s\S]*?padding:\s*0 !important;/,
	'onboarding connection edit controls must remain square under the Obsidian reset',
);

assert.match(
	primitiveCss,
	/button\.pk-onboarding-connect-another\s*\{[\s\S]*?width:\s*100% !important;[\s\S]*?min-height:\s*56px !important;[\s\S]*?padding:\s*12px 16px !important;/,
	'onboarding add-connection action must not collapse to an undersized text button',
);

assert.match(
	primitiveCss,
	/button\.pk-onboarding-empty-action\s*\{[\s\S]*?min-height:\s*42px !important;[\s\S]*?padding:\s*9px 14px !important;/,
	'onboarding initial connection action must remain usable under the Obsidian reset',
);

assert.match(
	primitiveCss,
	/\.peak-vault-intelligence-view \.pk-vi-object-card\.pk-btn\s*\{[\s\S]*?width:\s*100% !important;[\s\S]*?height:\s*78px !important;[\s\S]*?min-height:\s*78px !important;[\s\S]*?max-height:\s*78px !important;[\s\S]*?padding:\s*15px !important;/,
	'Vault Intelligence object cards must survive the Obsidian reset',
);

assert.match(
	primitiveCss,
	/\.peak-vault-intelligence-view \.pk-vi-activity-grid > \.pk-btn\s*\{[\s\S]*?width:\s*11px !important;[\s\S]*?height:\s*11px !important;[\s\S]*?min-width:\s*11px !important;[\s\S]*?min-height:\s*11px !important;[\s\S]*?max-width:\s*11px !important;[\s\S]*?max-height:\s*11px !important;[\s\S]*?padding:\s*0 !important;/,
	'Vault Intelligence activity cells must remain square under the Obsidian reset',
);

assert.match(
	primitiveCss,
	/\.peak-design-root \.pk-vi-build-inspect-row\.pk-btn\s*\{[\s\S]*?width:\s*100% !important;[\s\S]*?min-height:\s*40px !important;[\s\S]*?max-height:\s*none !important;[\s\S]*?padding:\s*0 15px !important;/,
	'Vault Intelligence document-state rows must retain the Mock table geometry under the Obsidian reset',
);

assert.doesNotMatch(
	primitiveCss,
	/\.pk-vi-graph-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 240px;/,
	'Vault Intelligence map context must remain below the graph instead of becoming a permanent right drawer',
);

assert.match(
	primitiveCss,
	/\.pk-vi-graph-context\s*\{[\s\S]*?grid-template-columns:\s*minmax\(220px, 0\.7fr\) minmax\(360px, 1\.3fr\);/,
	'Vault Intelligence map context must use its intended below-graph two-column summary',
);

assert.doesNotMatch(
	primitiveCss,
	/\.pk-vi-work-columns,[^{]*\{[^}]*grid-template-columns:\s*minmax\(190px, 1\.3fr\) minmax\(150px, 0\.8fr\) 112px 20px;/,
	'Vault Intelligence Work queue must not collapse its five production columns back to the legacy four-column grid',
);

assert.match(
	composerCss,
	/\.peak-composer-root \.pk-composer-collection-handle\s*\{[\s\S]*?width:\s*30px !important;[\s\S]*?height:\s*30px !important;[\s\S]*?min-width:\s*30px !important;[\s\S]*?min-height:\s*30px !important;[\s\S]*?max-width:\s*30px !important;[\s\S]*?max-height:\s*30px !important;[\s\S]*?padding:\s*0 !important;/,
	'Composer collection handle must retain its 30px hit target under the Obsidian button reset',
);

assert.match(
	composerCss,
	/\.peak-composer-root \.pk-composer-content-width-toggle\s*\{[\s\S]*?width:\s*28px !important;[\s\S]*?min-width:\s*28px !important;[\s\S]*?max-width:\s*28px !important;[\s\S]*?height:\s*28px !important;[\s\S]*?min-height:\s*28px !important;[\s\S]*?max-height:\s*28px !important;[\s\S]*?padding:\s*0 !important;/,
	'Composer content-width icon must retain its square hit target under the Obsidian button reset',
);

assert.match(
	composerCss,
	/\.peak-composer-root \.pk-composer-review-control\s*\{[\s\S]*?width:\s*30px !important;[\s\S]*?height:\s*30px !important;[\s\S]*?min-width:\s*30px !important;[\s\S]*?min-height:\s*30px !important;[\s\S]*?max-width:\s*30px !important;[\s\S]*?max-height:\s*30px !important;[\s\S]*?padding:\s*0 !important;/,
	'Composer review navigation arrows must keep a comfortable 30px target',
);

assert.match(
	composerSidecarCss,
	/\.peak-design-root \.pk-sidecar-task-new\s*\{[\s\S]*?width:\s*28px !important;[\s\S]*?height:\s*28px !important;[\s\S]*?min-width:\s*28px !important;[\s\S]*?min-height:\s*28px !important;[\s\S]*?max-width:\s*28px !important;[\s\S]*?max-height:\s*28px !important;[\s\S]*?padding:\s*0 !important;/,
	'Composer task-session add control must survive the Obsidian reset',
);

assert.match(
	composerSidecarCss,
	/\.pk-sidecar-task-tab__close\s*\{[\s\S]*?width:\s*18px !important;[\s\S]*?height:\s*18px !important;[\s\S]*?min-width:\s*18px !important;[\s\S]*?min-height:\s*18px !important;[\s\S]*?max-width:\s*18px !important;[\s\S]*?max-height:\s*18px !important;[\s\S]*?padding:\s*0 !important;/,
	'Composer task-session close control must survive the Obsidian reset',
);

assert.match(
	composerSidecarCss,
	/\.peak-design-root \.pk-session-model-trigger\s*\{[\s\S]*?width:\s*auto !important;[\s\S]*?max-width:\s*176px !important;[\s\S]*?height:\s*28px !important;[\s\S]*?min-height:\s*28px !important;[\s\S]*?max-height:\s*28px !important;[\s\S]*?padding:\s*0 7px !important;/,
	'Composer Copilot model trigger must survive the Obsidian reset',
);

assert.match(
	composerSidecarCss,
	/\.peak-design-root \.pk-sidecar-tab\s*\{[\s\S]*?width:\s*100% !important;[\s\S]*?min-width:\s*0 !important;[\s\S]*?max-width:\s*100% !important;[\s\S]*?height:\s*100% !important;[\s\S]*?min-height:\s*100% !important;[\s\S]*?max-height:\s*100% !important;[\s\S]*?padding:\s*0 12px !important;/,
	'Composer sidecar tabs must keep identical fixed geometry under the Obsidian button reset',
);

for (const [selector, height] of [
	['pkfa-quick-action', '30px'],
	['pkfa-compact-link-open', '26px'],
] as const) {
	assert.match(
		fileAtlasCss,
		new RegExp(`\\.peak-file-atlas-modal\\.pkfa-root \\.${selector}\\s*\\{[\\s\\S]*?height:\\s*${height} !important;[\\s\\S]*?min-height:\\s*${height} !important;[\\s\\S]*?max-height:\\s*${height} !important;[\\s\\S]*?padding:[^;]+!important;`),
		`${selector} must retain fixed geometry under the Obsidian button reset`,
	);
}

for (const [geometry, height] of [
	['toolbar', '32px'],
	['action', '36px'],
	['cta', '40px'],
	['prominent', '42px'],
] as const) {
	assert.match(
		primitiveCss,
		new RegExp(`\\.pk-button-geometry\\[data-geometry="${geometry}"\\][^{]*\\{[\\s\\S]*?--pk-button-geometry-height:\\s*${height};`),
		`${geometry} Button geometry must retain its intended ${height} hit target`,
	);
}

console.log('shared-button-reset-defense: passed');
