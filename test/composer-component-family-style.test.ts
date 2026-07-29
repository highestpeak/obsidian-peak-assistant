import assert from 'assert';
import { readFileSync } from 'fs';

let checks = 0;

function check(name: string, fn: () => void): void {
	checks += 1;
	try {
		fn();
	} catch (error) {
		console.error(`  XX ${name}`);
		throw error;
	}
}

function read(path: string): string {
	return readFileSync(path, 'utf8');
}

function expectRule(source: string, pattern: RegExp, label: string): void {
	assert.match(source, pattern, label);
}

const tableCss = read('src/styles/composer-table.css');
const nativeCss = read('src/styles/composer-native.css');
const fmMathCss = read('src/styles/composer-fm-math.css');
const composerCss = read('src/styles/composer.css');

check('block action row matches the selection toolbar compact spacing rhythm', () => {
	expectRule(
		composerCss,
		/\.pk-block-action-row__shell\s*\{[\s\S]*?gap:\s*4px;[\s\S]*?min-height:\s*38px;[\s\S]*?padding:\s*4px 6px;/,
		'block and selection toolbar shells must share the same outer spacing',
	);
	expectRule(
		composerCss,
		/\.pk-action-capsule\s*\{[\s\S]*?gap:\s*3px !important;[\s\S]*?height:\s*28px !important;[\s\S]*?padding:\s*0 5px !important;/,
		'block text controls must override the shared button padding and gap without shrinking their click height',
	);
	expectRule(
		composerCss,
		/\.pk-action-ai\s*\{[\s\S]*?gap:\s*0;[\s\S]*?padding-left:\s*4px;/,
		'AI group must balance divider breathing room with a tightly bound Sparkles icon',
	);
	expectRule(
		composerCss,
		/\.pk-action-divider\s*\{[\s\S]*?height:\s*16px;[\s\S]*?margin:\s*0;/,
		'block dividers must use the selection toolbar divider geometry',
	);
	expectRule(
		composerCss,
		/\.pk-action-history\s*\{[\s\S]*?width:\s*28px !important;[\s\S]*?min-width:\s*28px !important;[\s\S]*?padding:\s*0 !important;/,
		'icon-only history must use the same 28px square as selection icon controls',
	);
});

check('table toolbar shell uses the panel radius rung', () => {
	expectRule(
		tableCss,
		/\.pk-table-toolbar\s*\{[\s\S]*?border-radius:\s*var\(--pk-radius-lg,\s*12px\);/,
		'table toolbar shell must use radius-lg',
	);
});

check('table toolbar buttons match the shared 28px action-row rhythm', () => {
	expectRule(
		tableCss,
		/\.pk-table-toolbar button\s*\{[\s\S]*?height:\s*28px !important;[\s\S]*?min-height:\s*28px !important;[\s\S]*?max-height:\s*28px !important;[\s\S]*?border-radius:\s*var\(--pk-radius-md,\s*8px\);[\s\S]*?background:\s*transparent;[\s\S]*?font-size:\s*var\(--pk-text-xs,\s*11px\);/,
		'table toolbar controls must share the bottom action-row height and typography',
	);
});

check('table menu popover reuses the panel shell grammar', () => {
	expectRule(
		tableCss,
		/\.pk-table-menu\s*\{[\s\S]*?border-radius:\s*var\(--pk-radius-lg,\s*12px\);[\s\S]*?background:\s*var\(--pk-surface-overlay,\s*#fff\);/,
		'table menu must use the shared panel shell family',
	);
});

check('native shells use radius-lg instead of radius-md', () => {
	expectRule(
		nativeCss,
		/\.pk-native-block\s*\{[\s\S]*?border-radius:\s*var\(--pk-radius-lg\);/,
		'the shared native object frame must own the panel radius rung',
	);
	expectRule(
		nativeCss,
		/\.pk-native-code,\s*[\r\n]+\.peak-composer-root \.pk-native-embed\s*\{[\s\S]*?border-radius:\s*var\(--pk-radius-lg\);/,
		'standalone code and embed shells must retain the panel radius rung',
	);
});

check('code block has its own dark frame tokens', () => {
	expectRule(
		nativeCss,
		/--pkc-native-code-bg:\s*#141c2d;[\s\S]*?\.pk-native-code\s*\{[\s\S]*?background:\s*var\(--pkc-native-code-bg\);[\s\S]*?border-color:\s*var\(--pkc-native-code-border\);/,
		'code block frame must keep the dedicated dark shell styling',
	);
});

check('frontmatter state trigger stays a compact 22px badge above the grid', () => {
	expectRule(
		fmMathCss,
		/\.pk-fm-actions \.pk-btn\s*\{[\s\S]*?min-height:\s*22px !important;[\s\S]*?border-radius:\s*var\(--pk-radius-pill\) !important;[\s\S]*?background:\s*var\(--pk-accent-tint\) !important;/,
		'frontmatter suggestion trigger must stay a compact state badge; the Vault library action lives in the block row',
	);
});

check('formula row actions reuse the 28px pill capsule family', () => {
	expectRule(
		fmMathCss,
		/\.pk-math-card__row \.pk-btn,\s*[\r\n]+\.peak-composer-root \.pk-math-card__row \.pk-math-card__ai\s*\{[\s\S]*?min-height:\s*28px !important;[\s\S]*?border-radius:\s*var\(--pk-radius-pill\) !important;/,
		'formula row actions must use the block capsule family',
	);
});

check('formula detail shell and input align to panel/review rungs', () => {
	expectRule(
		fmMathCss,
		/\.pk-formula-detail\s*\{[\s\S]*?border-radius:\s*var\(--pk-radius-lg,\s*12px\);[\s\S]*?background:\s*var\(--pk-surface-overlay,\s*#fff\);/,
		'formula detail shell must use radius-lg',
	);
	expectRule(
		fmMathCss,
		/\.pk-formula-detail__input\s*\{[\s\S]*?height:\s*30px;[\s\S]*?border-radius:\s*var\(--pk-radius-md,\s*8px\);/,
		'formula detail input must use the review/form-control radius rung',
	);
	expectRule(
		fmMathCss,
		/\.pk-formula-detail__nav \.pk-btn,\s*[\r\n]+\.peak-composer-root \.pk-formula-detail__foot > \.pk-btn\s*\{[\s\S]*?min-height:\s*30px !important;[\s\S]*?border-radius:\s*var\(--pk-radius-md\) !important;/,
		'formula detail buttons must stay in the 30px review family',
	);
});

console.log(`composer-component-family-style: ${checks}/${checks} checks passed`);
