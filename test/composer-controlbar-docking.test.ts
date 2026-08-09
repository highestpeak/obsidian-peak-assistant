import assert from 'node:assert';
import { readFileSync } from 'node:fs';

function cssBlock(css: string, selector: string): string {
	const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'm'));
	assert.ok(match, `missing CSS block for ${selector}`);
	return match[1];
}

function assertDecl(block: string, declaration: string, message: string): void {
	assert.ok(
		block.includes(declaration),
		`${message}\nExpected declaration: ${declaration}\nActual block:\n${block.trim()}`,
	);
}

const composerCss = readFileSync('src/styles/composer.css', 'utf8');
const sidecarCss = readFileSync('src/styles/composer-sidecar.css', 'utf8');

const root = cssBlock(composerCss, '.peak-composer-root');
assertDecl(root, 'padding: 0;', 'the Composer root must not inset the application toolbar');
assertDecl(root, 'overflow: hidden;', 'the Composer main scrollport must own document scrolling');

const main = cssBlock(composerCss, '.peak-composer-root .pk-composer-main');
assertDecl(main, 'overflow-y: auto;', 'the main column must own sticky-toolbar scrolling');
assert.equal(
	main.includes('display: flex;') || main.includes('flex-direction:'),
	false,
	'the scrolling main column must keep normal block flow so long document paper cannot flex-shrink',
);
assertDecl(
	main,
	'padding: 0 var(--pkc-stage-pad-x) var(--pkc-stage-pad-y-bottom);',
	'the main column must reserve stage gutters below the full-bleed toolbar',
);

const controlbar = cssBlock(composerCss, '.peak-composer-root .pk-composer-controlbar');
assertDecl(controlbar, 'top: 0;', 'the toolbar must dock to the Composer scrollport top');
assertDecl(controlbar, 'max-width: none;', 'the toolbar must span the entire Composer main column');
assertDecl(
	controlbar,
	'margin: 0 calc(var(--pkc-stage-pad-x) * -1);',
	'the toolbar must bleed through the main column stage gutters',
);
assertDecl(controlbar, 'border: 0;', 'the docked toolbar must not retain a floating-card frame');
assertDecl(
	controlbar,
	'border-bottom: 1px solid var(--pk-border-soft);',
	'the docked toolbar must separate chrome from the document stage',
);
assertDecl(controlbar, 'border-radius: 0;', 'the docked toolbar must not look like a floating pill');
assertDecl(controlbar, 'box-shadow: none;', 'the resting toolbar must stay flat');
assertDecl(controlbar, 'backdrop-filter: none;', 'the docked toolbar must use an opaque application surface');

const workspace = cssBlock(composerCss, '.peak-composer-root .pk-composer-workspace');
assertDecl(
	workspace,
	'margin: var(--pkc-stage-pad-y-top) auto 0;',
	'the document stage must retain breathing room below the toolbar',
);

const sidecarMain = cssBlock(
	sidecarCss,
	".peak-composer-root[data-with-sidecar='true'] .pk-composer-main",
);
assert.equal(
	sidecarMain.includes('padding:'),
	false,
	'the sidecar layout must not override the shared full-bleed main-column gutters',
);

console.log('composer-controlbar-docking: all guards passed');
