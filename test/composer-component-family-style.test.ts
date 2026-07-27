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

check('table toolbar shell uses the panel radius rung', () => {
	expectRule(
		tableCss,
		/\.pk-table-toolbar\s*\{[\s\S]*?border-radius:\s*var\(--pk-radius-lg,\s*12px\);/,
		'table toolbar shell must use radius-lg',
	);
});

check('table toolbar buttons keep compact 28px radius-md transparent controls', () => {
	expectRule(
		tableCss,
		/\.pk-table-toolbar button\s*\{[\s\S]*?min-height:\s*28px;[\s\S]*?border-radius:\s*var\(--pk-radius-md,\s*8px\);[\s\S]*?background:\s*transparent;[\s\S]*?font-size:\s*var\(--pk-text-xs,\s*11px\);/,
		'table toolbar buttons must stay in the compact toolbar family',
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
		/\.pk-native-block__body,\s*[\r\n]+\.peak-composer-root \.pk-native-code,\s*[\r\n]+\.peak-composer-root \.pk-native-embed\s*\{[\s\S]*?border-radius:\s*var\(--pk-radius-lg\);/,
		'native block shells must use the panel radius rung',
	);
});

check('code block has its own dark frame tokens', () => {
	expectRule(
		nativeCss,
		/--pkc-native-code-bg:\s*#141c2d;[\s\S]*?\.pk-native-code\s*\{[\s\S]*?background:\s*var\(--pkc-native-code-bg\);[\s\S]*?border-color:\s*var\(--pkc-native-code-border\);/,
		'code block frame must keep the dedicated dark shell styling',
	);
});

check('frontmatter actions reuse the 28px pill capsule family', () => {
	expectRule(
		fmMathCss,
		/\.pk-fm-actions \.pk-btn\s*\{[\s\S]*?min-height:\s*28px !important;[\s\S]*?border-radius:\s*var\(--pk-radius-pill\) !important;[\s\S]*?background:\s*transparent !important;/,
		'frontmatter actions must use the block capsule family',
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
