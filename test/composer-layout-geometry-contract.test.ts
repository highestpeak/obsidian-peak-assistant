import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { resolveSidecarMode } from '@/ui/view/composer/sidecar/IntelligenceSidecar';

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

const composerCss = read('src/styles/composer.css');
const sidecarCss = read('src/styles/composer-sidecar.css');

const root = cssBlock(composerCss, '.peak-composer-root');
assertDecl(root, '--pkc-paper-width: 900px;', 'paper outer width must match the corrected integrated reference');
assertDecl(root, '--pkc-paper-pad-y-top: 40px;', 'paper top padding must match the corrected integrated reference');
assertDecl(root, '--pkc-paper-pad-x: 64px;', 'paper horizontal padding must match the corrected integrated reference');
assertDecl(root, '--pkc-paper-pad-y-bottom: 64px;', 'paper bottom padding must match the corrected integrated reference');
assertDecl(root, '--pkc-h1-size: 32px;', 'H1 size must match the corrected integrated reference');
assertDecl(root, '--pkc-h2-size: 22px;', 'H2 size must match the corrected integrated reference');
assertDecl(root, '--pkc-prose-size: 15px;', 'prose size must match the corrected integrated reference');
assert.equal(composerCss.includes('--pkc-paper-width: 868px;'), false, 'old rejected 868px paper width must not return');

const shell = cssBlock(composerCss, '.peak-composer-root .pk-composer-shell');
assertDecl(shell, 'max-width: var(--pkc-paper-width);', 'paper must use the canonical width variable');
assertDecl(shell, 'padding: var(--pkc-paper-pad-y-top) var(--pkc-paper-pad-x) var(--pkc-paper-pad-y-bottom);', 'paper must use the canonical padding variables');

assertDecl(
	cssBlock(composerCss, ".peak-composer-root .pk-composer-heading[data-level='1']"),
	'line-height: 1.25;',
	'H1 line height must compute to 40px at 32px',
);
assertDecl(
	cssBlock(composerCss, ".peak-composer-root .pk-composer-heading[data-level='2']"),
	'line-height: 1.35;',
	'H2 line height must compute to 29.7px at 22px',
);
assertDecl(
	cssBlock(composerCss, '.peak-composer-root .pk-composer-prose'),
	'line-height: 1.8;',
	'prose line height must compute to 27px at 15px',
);

const desktopAnchor = cssBlock(sidecarCss, ".pk-sidecar-anchor[data-sidecar-mode='desktop'][data-open='true']");
assertDecl(desktopAnchor, 'flex: 0 0 444px;', 'desktop sidecar track must equal 430px sidecar plus the 14px right gutter');

const sidecar = cssBlock(sidecarCss, '.pk-sidecar');
assertDecl(sidecar, 'flex: 0 0 430px;', 'desktop sidecar body width must remain 430px');
assertDecl(sidecar, 'margin: 14px 14px 14px 0;', 'desktop sidecar gutters must remain 14px');

const controlbar = cssBlock(composerCss, '.peak-composer-root .pk-composer-controlbar');
assertDecl(controlbar, 'z-index: 80;', 'sticky controlbar layer is the reference drawer must clear');

const rootWithSidecar = cssBlock(sidecarCss, ".peak-composer-root[data-with-sidecar='true']");
assertDecl(rootWithSidecar, '--pk-sidecar-drawer-z: 90;', 'drawer overlay must be above the sticky controlbar layer');
assertDecl(rootWithSidecar, '--pk-sidecar-drawer-surface-z: 91;', 'drawer surface must be above its overlay anchor');

const drawerAnchor = cssBlock(sidecarCss, ".pk-sidecar-anchor[data-sidecar-mode='drawer']");
assertDecl(drawerAnchor, 'z-index: var(--pk-sidecar-drawer-z, 90);', 'drawer anchor must overlay the Composer sticky controlbar');

const drawer = cssBlock(sidecarCss, '.pk-sidecar-drawer');
assertDecl(drawer, 'width: min(440px, calc(100% - 24px));', 'narrow drawer width must be host-contained at 440px');
assertDecl(drawer, 'max-width: calc(100% - 24px);', 'narrow drawer must stay inside the host horizontally');
assertDecl(drawer, 'z-index: var(--pk-sidecar-drawer-surface-z, 91);', 'drawer surface must not render under sticky document controls');
assert.equal(resolveSidecarMode(1040, 1180), 'drawer', '1040px host must use drawer mode');
assert.equal(resolveSidecarMode(1440, 1180), 'desktop', '1440px host must use desktop sidecar mode');

console.log('composer-layout-geometry-contract: all guards passed');
