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
assertDecl(sidecar, 'align-self: stretch;', 'desktop sidecar must stretch inside the 444px anchor track');
assertDecl(sidecar, 'height: auto;', 'desktop sidecar must not rely on percentage/calc height');
assertDecl(sidecar, 'margin: 14px 14px 14px 0;', 'desktop sidecar must keep narrow dock gutters');

const sidecarDrawer = cssBlock(css, '.pk-sidecar-drawer');
assertDecl(sidecarDrawer, 'position: absolute;', 'narrow drawer must be contained by the Composer host, not the owner window');
assertDecl(sidecarDrawer, 'top: 12px;', 'narrow drawer must keep the canonical 12px top inset');
assertDecl(sidecarDrawer, 'right: 12px;', 'narrow drawer must keep the canonical 12px right inset');
assertDecl(sidecarDrawer, 'bottom: 12px;', 'narrow drawer must keep the canonical 12px bottom inset');
assertDecl(sidecarDrawer, 'height: auto;', 'narrow drawer height must come from top/bottom host insets');
assertDecl(sidecarDrawer, 'width: min(440px, calc(100% - 24px));', 'narrow drawer width must be host-contained, not viewport-contained');
assertDecl(sidecarDrawer, 'max-width: calc(100% - 24px);', 'narrow drawer must never overflow the Composer host horizontally');
assert.ok(!sidecarDrawer.includes('100vw'), 'narrow drawer must not use owner-window viewport width');
assert.ok(!sidecarDrawer.includes('position: fixed;'), 'narrow drawer must not use owner-window fixed positioning');
assertDecl(sidecarDrawer, 'border: 1px solid var(--pk-border);', 'narrow drawer must keep the complete card border');
assertDecl(sidecarDrawer, 'border-radius: 18px;', 'narrow drawer must keep the complete card radius');
assertDecl(sidecarDrawer, 'box-shadow: var(--pk-shadow-modal);', 'narrow drawer must keep the complete card shadow');
assertDecl(sidecarDrawer, 'visibility: hidden;', 'drawer closed state should be visually hidden');
assertDecl(sidecarDrawer, 'pointer-events: none;', 'drawer closed state should disable pointer interaction');
assertDecl(sidecarDrawer, 'transition: transform 180ms ease;', 'drawer should keep a close/open transition');
assertDecl(cssBlock(css, '.pk-sidecar-drawer--open'), 'visibility: visible;', 'drawer open state should restore interactivity');
assertDecl(cssBlock(css, '.pk-sidecar-drawer--open'), 'pointer-events: auto;', 'drawer open state should restore pointer interaction');

const sidecarAnchor = cssBlock(css, '.pk-sidecar-anchor');
assertDecl(sidecarAnchor, 'flex: 0 0 0;', 'anchor should not consume flex width by default');
assertDecl(sidecarAnchor, 'width: 0;', 'anchor base state should stay width zero');
assertDecl(sidecarAnchor, 'max-width: 0;', 'anchor base state should stay width zero');

const measuringAnchor = cssBlock(css, ".pk-sidecar-anchor[data-measuring='true']");
assertDecl(measuringAnchor, 'flex: 0 0 0;', 'measuring anchor must not reserve layout width');
assertDecl(measuringAnchor, 'width: 0;', 'measuring anchor must keep width zero');
assertDecl(measuringAnchor, 'max-width: 0;', 'measuring anchor must keep max-width zero');

const desktopAnchor = cssBlock(css, ".pk-sidecar-anchor[data-sidecar-mode='desktop']");
assertDecl(desktopAnchor, 'display: flex;', 'desktop anchor must lay out the sidecar as a flex track');
assertDecl(desktopAnchor, 'align-items: stretch;', 'desktop anchor must stretch the sidecar card');
assertDecl(
	cssBlock(css, ".pk-sidecar-anchor[data-sidecar-mode='desktop'][data-open='true']"),
	'flex: 0 0 444px;',
	'desktop anchor must keep reserved width when open',
);
assertDecl(
	cssBlock(css, ".pk-sidecar-anchor[data-sidecar-mode='desktop'][data-open='false']"),
	'flex: 0 0 0;',
	'desktop anchor must collapse to zero when closed',
);
assertDecl(
	cssBlock(css, ".pk-sidecar-anchor[data-sidecar-mode='drawer']"),
	'flex: 0 0 0;',
	'drawer mode anchor must not reserve width in document flow',
);
assertDecl(
	cssBlock(css, ".pk-sidecar-anchor[data-sidecar-mode='drawer']"),
	'position: absolute;',
	'drawer mode anchor must leave flex flow and overlay only the Composer host',
);
assertDecl(
	cssBlock(css, ".pk-sidecar-anchor[data-sidecar-mode='drawer']"),
	'inset: 0;',
	'drawer mode anchor must cover the Composer host bounds',
);
assertDecl(
	cssBlock(css, ".pk-sidecar-anchor[data-sidecar-mode='drawer']"),
	'width: auto;',
	'drawer mode anchor must use host bounds, not a zero-width containing block',
);
assertDecl(cssBlock(css, ".pk-sidecar-anchor[data-sidecar-mode='drawer']"), 'max-width: none;', 'drawer mode anchor must not clamp host overlay width');
assertDecl(cssBlock(css, ".pk-sidecar-anchor[data-sidecar-mode='drawer']"), 'pointer-events: none;', 'drawer overlay anchor must not intercept document interactions when closed');

const rootWithSidecar = cssBlock(css, ".peak-composer-root[data-with-sidecar='true']");
assertDecl(rootWithSidecar, 'position: relative;', 'with-sidecar root must be the drawer positioning container');
assertDecl(rootWithSidecar, 'padding: 0;', 'with-sidecar root must not own shared stage padding');
assertDecl(rootWithSidecar, 'overflow: hidden;', 'with-sidecar root must bound the shell and prevent horizontal page overflow');

const mainWithSidecar = cssBlock(css, ".peak-composer-root[data-with-sidecar='true'] .pk-composer-main");
assertDecl(mainWithSidecar, 'overflow-y: auto;', 'Composer main must own vertical scrolling when the sidecar is mounted');
assertDecl(mainWithSidecar, 'padding: var(--pkc-stage-pad-y-top) var(--pkc-stage-pad-x) var(--pkc-stage-pad-y-bottom);', 'Composer main must own stage gutters when the sidecar is mounted');

const closedSidecar = cssBlock(css, '.pk-sidecar--closed');
assertDecl(closedSidecar, 'flex-basis: 0;', 'closed desktop sidecar child must collapse its own flex basis');
assertDecl(closedSidecar, 'width: 0 !important;', 'closed desktop sidecar child must collapse width despite button reset rules');
assertDecl(closedSidecar, 'min-width: 0 !important;', 'closed desktop sidecar child must collapse min-width despite reset rules');
assertDecl(closedSidecar, 'margin: 0;', 'closed desktop sidecar child must not leak gutter width');
assertDecl(closedSidecar, 'border-width: 0;', 'closed desktop sidecar child must not leak border width');

const openToggle = cssBlock(css, ".peak-composer-root[data-with-sidecar='true'] .pk-sidecar-open-toggle");
assertDecl(openToggle, 'position: absolute;', 'closed sidecar entry must be positioned relative to the Composer host');
assertDecl(openToggle, 'right: 12px;', 'closed sidecar entry must keep the canonical right inset');
assertDecl(openToggle, 'top: 12px;', 'closed sidecar entry must keep the canonical top inset');
assertDecl(openToggle, 'height: 28px !important;', 'closed sidecar entry must defend its height against Obsidian reset');
assertDecl(openToggle, 'min-height: 28px !important;', 'closed sidecar entry must defend its min-height against Obsidian reset');
assertDecl(openToggle, 'padding: 0 10px !important;', 'closed sidecar entry must defend its padding against Obsidian reset');
assertDecl(openToggle, 'pointer-events: auto;', 'closed sidecar entry must remain clickable while drawer anchor ignores pointer events');
assert.ok(!openToggle.includes('position: fixed;'), 'closed sidecar entry must not use owner-window fixed positioning');

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
	/ResizeObserver/.test(sidecarTsx) && sidecarTsx.includes("closest<HTMLElement>('.peak-composer-root')"),
	'production sidecar must observe actual Composer host width instead of ownerWindow.innerWidth or the sidecar column',
);
assert.ok(
	!sidecarTsx.includes('document.documentElement'),
	'host observer fallback must not use global document.documentElement',
);
assert.ok(
	/aria-hidden=\{!drawerOpen\}/.test(sidecarTsx) && /onClose=\{\(\) => setDrawerOpen\(false\)\}/.test(sidecarTsx),
	'narrow sidecar drawer must keep close/reopen and aria-hidden behavior',
);
assert.ok(
	sidecarTsx.includes("data-open={drawerOpen ? 'true' : 'false'}") && sidecarTsx.includes("data-open={desktopOpen ? 'true' : 'false'}"),
	'desktop and drawer anchors should use explicit data-open state for deterministic CSS',
);
assert.ok(sidecarTsx.includes('className="pk-sidecar-open-toggle"'), 'desktop anchor should expose reopen control');
assert.ok(sidecarTsx.includes("import { Button }"), 'closed sidecar entry must use the project Button primitive');
assert.ok(!sidecarTsx.includes('pk-sidecar-drawer-toggle'), 'drawer closed entry must share the desktop closed visual grammar');
assert.ok(sidecarTsx.includes('data-sidecar-mode="desktop"'), 'desktop sidecar anchor should carry sidecar mode marker');
assert.ok(
	/role="tab"/.test(sidecarTsx) && /aria-selected=\{active\}/.test(sidecarTsx),
	'Copilot/History switch must remain real accessible tabs, not presentation-only CSS',
);
