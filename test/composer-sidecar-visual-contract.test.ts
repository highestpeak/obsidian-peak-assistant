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
const composerCss = read('src/styles/composer.css');
const peakComponentsCss = read('src/styles/peak-components.css');
const sidecarTsx = read('src/ui/view/composer/sidecar/IntelligenceSidecar.tsx');
const sidecarConfig = read('src/ui/view/composer/sidecar/sidecarConfig.ts');
const relatedModalTsx = read('src/ui/view/composer/sidecar/RelatedMaterialsModal.tsx');
const quickSearchModalTsx = read('src/app/ui-host/modals/QuickSearchModal.tsx');

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
assertDecl(sidecarDrawer, 'z-index: var(--pk-sidecar-drawer-surface-z, 91);', 'narrow drawer surface must render above sticky Composer chrome');
assertDecl(sidecarDrawer, 'visibility: hidden;', 'drawer closed state should be visually hidden');
assertDecl(sidecarDrawer, 'pointer-events: none;', 'drawer closed state should disable pointer interaction');
assert.ok(
	!sidecarDrawer.includes('transition:'),
	'drawer restore/mount must not animate before an explicit user transition',
);
assert.ok(
	/transition:[\s\S]*transform 180ms ease/.test(cssBlock(css, '.pk-sidecar-drawer--user-transition')),
	'drawer should animate only after an explicit user close/open transition',
);
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
assertDecl(desktopAnchor, 'overflow: hidden;', 'desktop anchor must clip the fixed-width sidecar while its track closes');
assert.ok(
	!desktopAnchor.includes('transition:'),
	'desktop restore/mount must not slide the sidecar into view',
);
assert.ok(
	cssBlock(css, ".pk-sidecar-anchor--user-transition[data-sidecar-mode='desktop']")
		.includes('max-width 260ms cubic-bezier(0.4, 0, 0.2, 1)'),
	'desktop anchor must animate max-width only for explicit user transitions',
);
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
assertDecl(cssBlock(css, ".pk-sidecar-anchor[data-sidecar-mode='drawer']"), 'z-index: var(--pk-sidecar-drawer-z, 90);', 'drawer overlay anchor must sit above the sticky Composer control bar');

const rootWithSidecar = cssBlock(css, ".peak-composer-root[data-with-sidecar='true']");
assertDecl(rootWithSidecar, '--pk-sidecar-drawer-z: 90;', 'drawer overlay layer must stay above the 80 sticky controlbar layer');
assertDecl(rootWithSidecar, '--pk-sidecar-drawer-surface-z: 91;', 'drawer surface layer must stay above its overlay anchor');
assertDecl(rootWithSidecar, '--pk-sidecar-modal-z: 110;', 'related material modal must stay above the open drawer');
assertDecl(rootWithSidecar, 'position: relative;', 'with-sidecar root must be the drawer positioning container');
assertDecl(rootWithSidecar, 'padding: 0;', 'with-sidecar root must not own shared stage padding');
assertDecl(rootWithSidecar, 'overflow: hidden;', 'with-sidecar root must bound the shell and prevent horizontal page overflow');

const controlbar = cssBlock(composerCss, '.peak-composer-root .pk-composer-controlbar');
assertDecl(controlbar, 'z-index: 80;', 'sticky Composer control bar is the layer drawer must cover');

const mainWithSidecar = cssBlock(css, ".peak-composer-root[data-with-sidecar='true'] .pk-composer-main");
assertDecl(mainWithSidecar, 'overflow-y: auto;', 'Composer main must own vertical scrolling when the sidecar is mounted');
assertDecl(mainWithSidecar, 'padding: var(--pkc-stage-pad-y-top) var(--pkc-stage-pad-x) var(--pkc-stage-pad-y-bottom);', 'Composer main must own stage gutters when the sidecar is mounted');

const closedSidecar = cssBlock(css, '.pk-sidecar--closed');
assertDecl(closedSidecar, 'opacity: 0;', 'closed desktop sidecar child must fade while the outer track collapses');
assertDecl(closedSidecar, 'transform: translateX(18px);', 'closed desktop sidecar child must ease toward the dock edge');
assert.ok(
	!closedSidecar.includes('width: 0') && !closedSidecar.includes('max-width: 0') && !closedSidecar.includes('flex-basis: 0'),
	'desktop sidecar child must preserve its geometry so the animated outer track owns the collapse',
);

assert.ok(
	!css.includes('.pk-sidecar-open-toggle'),
	'closed sidecar entry must be owned by the unified Composer control bar, not a detached sidecar toggle',
);

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
assert.ok(
	sidecarTsx.indexOf('className="pk-sidecar-tabs"')
		< sidecarTsx.indexOf('<WorkspaceScopeMenu'),
	'workspace scope must sit inside Copilot content after the primary Copilot / History navigation',
);
assert.ok(
	!sidecarTsx.includes('pk-sidecar-scope-switch'),
	'workspace scope must not remain a second full-width segmented navigation row',
);
const contextBar = cssBlock(css, '.pk-sidecar-context-bar');
assertDecl(contextBar, 'min-height: 34px;', 'Copilot scope context should stay visually secondary and compact');
const scopeTrigger = cssBlock(css, '.peak-design-root .pk-sidecar-scope-trigger');
assertDecl(scopeTrigger, 'height: 28px !important;', 'scope trigger must retain its compact hit target under Obsidian resets');
assertDecl(scopeTrigger, 'width: auto !important;', 'scope trigger must not read as a full-width primary navigation control');

const tab = cssBlock(css, '.pk-sidecar-tab');
assertDecl(tab, 'justify-content: center;', 'primary switch labels must be centered');
assertDecl(tab, 'border-radius: 9px;', 'primary switch active surface must keep the canonical inner radius');
assertDecl(tab, 'font-weight: 620;', 'primary switch labels must keep the canonical weight');
const activeTab = cssBlock(css, '.pk-sidecar-tab--active');
assertDecl(activeTab, 'background: var(--pk-surface);', 'active primary tab must use a raised surface');
assertDecl(activeTab, 'box-shadow: var(--pk-shadow-sm);', 'active primary tab must keep the subtle shadow');

const relatedModalOverlay = cssBlock(css, '.pk-related-modal-overlay');
assertDecl(relatedModalOverlay, 'z-index: var(--pk-sidecar-modal-z, 110);', 'related material modal must cover the drawer and sticky Composer chrome');
const resultBrowserFrame = cssBlock(peakComponentsCss, '.peak-result-browser-modal-frame');
assertDecl(resultBrowserFrame, '--pk-result-browser-frame-top: 80px;', 'Result Browser frame keeps the production Quick Search top offset');
assertDecl(resultBrowserFrame, '--pk-result-browser-frame-width: 1100px;', 'Result Browser frame keeps the production Quick Search width');
assertDecl(resultBrowserFrame, '--pk-result-browser-frame-max-width: 90vw;', 'Result Browser frame keeps the production Quick Search responsive cap');
assertDecl(resultBrowserFrame, '--pk-result-browser-frame-height: calc(100vh - 160px);', 'Result Browser frame keeps the production Quick Search viewport height');
assert.ok(
	quickSearchModalTsx.includes("modalEl.addClass('peak-result-browser-modal-frame')"),
	'Quick Search must consume the shared Result Browser modal frame',
);
assert.ok(
	relatedModalTsx.includes('pk-related-modal peak-result-browser-modal-frame'),
	'related materials must consume the same Result Browser modal frame',
);
const relatedModal = cssBlock(css, '.pk-related-modal.pk-modal-shell[data-state]');
assertDecl(relatedModal, 'top: var(--pk-result-browser-frame-top);', 'related material modal must consume the shared Quick Search top geometry');
assertDecl(relatedModal, 'left: 50%;', 'related material modal must center against the owner viewport');
assertDecl(relatedModal, 'width: var(--pk-result-browser-frame-width);', 'related material modal must consume the shared Quick Search desktop width');
assertDecl(relatedModal, 'height: var(--pk-result-browser-frame-height);', 'related material modal must consume the shared Quick Search viewport height');
assertDecl(relatedModal, 'max-width: var(--pk-result-browser-frame-max-width);', 'related material modal must consume the shared Quick Search responsive width cap');
assertDecl(relatedModal, 'transform: translateX(-50%);', 'related material modal must not compensate for the sidecar with a fixed offset');
const relatedContent = cssBlock(css, '.pk-related-content');
assertDecl(relatedContent, 'grid-template-columns: minmax(0, 1fr);', 'related material list owns the full width while inspector is closed');
const relatedContentWithInspector = cssBlock(css, '.pk-related-content--inspector');
assertDecl(relatedContentWithInspector, 'grid-template-columns: minmax(0, 1fr) 340px;', 'related material inspector matches Search narrow side-panel width');
const relatedFilter = cssBlock(css, '.pk-related-filter');
assertDecl(relatedFilter, 'width: 100%;', 'related material query field occupies its own full-width row');
assertDecl(relatedFilter, 'max-width: none;', 'related material query field is not squeezed into the toolbar');

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
	/aria-hidden=\{!open\}/.test(sidecarTsx) && /onClose=\{\(\) => onOpenChange\(false\)\}/.test(sidecarTsx),
	'narrow sidecar drawer must keep controlled close/reopen and aria-hidden behavior',
);
assert.ok(
	sidecarTsx.includes("data-open={open ? 'true' : 'false'}"),
	'desktop and drawer anchors should use explicit data-open state for deterministic CSS',
);
assert.ok(!sidecarTsx.includes('pk-sidecar-open-toggle'), 'desktop anchor must not expose a detached reopen control');
assert.ok(!sidecarTsx.includes('pk-sidecar-drawer-toggle'), 'drawer closed entry must share the desktop closed visual grammar');
assert.ok(sidecarTsx.includes('data-sidecar-mode="desktop"'), 'desktop sidecar anchor should carry sidecar mode marker');
assert.ok(
	/role="tab"/.test(sidecarTsx) && /aria-selected=\{active\}/.test(sidecarTsx),
	'Copilot/History switch must remain real accessible tabs, not presentation-only CSS',
);
