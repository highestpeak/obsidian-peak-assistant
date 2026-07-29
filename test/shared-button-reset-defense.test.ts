import assert from 'assert';
import { readFileSync } from 'fs';

const resetCss = readFileSync('src/styles/obsidian-reset.css', 'utf8');
const primitiveCss = readFileSync('src/styles/peak-components.css', 'utf8');

assert.match(
	resetCss,
	/\.peak-design-root button,[\s\S]*?height:\s*auto !important;[\s\S]*?min-height:\s*0 !important;[\s\S]*?max-height:\s*none !important;/,
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

function targetsButtonPrimitive(selector: string): boolean {
	if (/\bsvg\b|\.icon\b|::before|::after/.test(selector)) return false;
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

console.log('shared-button-reset-defense: passed');
