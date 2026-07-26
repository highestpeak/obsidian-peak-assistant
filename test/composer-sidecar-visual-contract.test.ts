import assert from 'assert';
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();

function read(relPath: string): string {
	return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function cssBlock(css: string, selector: string): string {
	const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'm'));
	assert.ok(match, `missing CSS block for ${selector}`);
	return match[1];
}

function assertDecl(block: string, declaration: string, message: string): void {
	assert.ok(block.includes(declaration), `${message}\nExpected declaration: ${declaration}\nActual block:\n${block.trim()}`);
}

const css = read('src/styles/composer-sidecar.css');
const sidecarTsx = read('src/ui/view/composer/sidecar/IntelligenceSidecar.tsx');
const sidecarConfig = read('src/ui/view/composer/sidecar/sidecarConfig.ts');

const sidecar = cssBlock(css, '.pk-sidecar');
assertDecl(sidecar, 'flex: 0 0 430px;', 'desktop sidecar must keep the canonical 430px column');
assertDecl(sidecar, 'width: 430px;', 'desktop sidecar width must match the canonical reference');
assertDecl(sidecar, 'max-width: none;', 'desktop sidecar must not shrink through the old 40vw cap');

const header = cssBlock(css, '.pk-sidecar-header');
assertDecl(header, 'min-height: 58px;', 'sidecar header must keep the canonical restrained presence height');
assertDecl(header, 'padding: 10px 13px 8px;', 'sidecar header padding must match the canonical balance');

const spark = cssBlock(css, '.pk-sidecar-spark');
assertDecl(spark, 'width: 18px;', 'sidecar presence icon must remain an unboxed 18px spark');
assertDecl(spark, 'height: 18px;', 'sidecar presence icon must remain an unboxed 18px spark');
assertDecl(spark, 'border-radius: 0;', 'sidecar presence icon must stay unboxed');

const title = cssBlock(css, '.pk-sidecar-title');
assertDecl(title, 'font-size: var(--pk-text-xl);', 'sidecar title must use the canonical 16px token');
const subtitle = cssBlock(css, '.pk-sidecar-subtitle');
assertDecl(subtitle, 'font-size: var(--pk-text-xs);', 'sidecar subtitle must use the canonical 10px token');

const tabs = cssBlock(css, '.pk-sidecar-tabs');
assertDecl(tabs, 'display: grid;', 'primary Copilot/History switch must be a segmented grid');
assertDecl(tabs, 'grid-template-columns: 1fr 1fr;', 'primary switch must keep two equal columns');
assertDecl(tabs, 'height: 42px;', 'primary switch must keep the canonical 42px height');
assertDecl(tabs, 'gap: 3px;', 'primary switch must keep the canonical 3px inner gap');
assertDecl(tabs, 'padding: 3px;', 'primary switch must keep the canonical 3px inner padding');
assertDecl(tabs, 'background: var(--pk-surface-sunken);', 'primary switch must keep the sunken segmented background');

const tab = cssBlock(css, '.pk-sidecar-tab');
assertDecl(tab, 'justify-content: center;', 'primary switch labels must be centered');
assertDecl(tab, 'border-radius: 9px;', 'primary switch active surface must keep the canonical inner radius');
assertDecl(tab, 'font-weight: 620;', 'primary switch labels must keep the canonical weight');
const activeTab = cssBlock(css, '.pk-sidecar-tab--active');
assertDecl(activeTab, 'background: var(--pk-surface);', 'active primary tab must use a raised surface');
assertDecl(activeTab, 'box-shadow: var(--pk-shadow-sm);', 'active primary tab must keep the subtle shadow');

assert.ok(
	/narrowBreakpointPx:\s*1180/.test(sidecarConfig),
	'production sidecar must preserve the existing 1180px narrow breakpoint',
);
assert.ok(
	/role="tab"/.test(sidecarTsx) && /aria-selected=\{active\}/.test(sidecarTsx),
	'Copilot/History switch must remain real accessible tabs, not presentation-only CSS',
);
