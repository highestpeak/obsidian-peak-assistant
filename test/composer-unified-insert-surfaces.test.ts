import assert from 'assert';
import { readFileSync } from 'fs';
import {
	canReplaceComposerSurface,
	composerSurfacePriority,
	type ComposerSurfaceClaim,
} from '@/ui/view/composer/chrome/ComposerSurfaceCoordinator';

const claim = (
	id: string,
	kind: ComposerSurfaceClaim['kind'],
): ComposerSurfaceClaim => ({ id, kind, ownerId: id });

assert.ok(
	composerSurfacePriority('draft') > composerSurfacePriority('selection') &&
		composerSurfacePriority('selection') > composerSurfacePriority('link') &&
		composerSurfacePriority('link') > composerSurfacePriority('menu') &&
		composerSurfacePriority('menu') > composerSurfacePriority('block-actions'),
	'Composer uses one explicit transient-surface priority order',
);
assert.ok(
	canReplaceComposerSurface(claim('actions', 'block-actions'), claim('link', 'link')),
	'a settled link preview may replace low-priority block chrome',
);
assert.equal(
	canReplaceComposerSurface(claim('draft', 'draft'), claim('link', 'link')),
	false,
	'a hover preview cannot replace an active draft',
);
assert.equal(
	canReplaceComposerSurface(claim('menu-a', 'menu'), claim('menu-b', 'menu')),
	false,
	'equal-priority hover surfaces cannot race each other',
);
assert.ok(
	canReplaceComposerSurface(claim('menu', 'menu'), claim('menu', 'menu')),
	'the current owner may update its own surface',
);

const root = readFileSync('src/ui/view/composer/ComposerRoot.tsx', 'utf8');
const link = readFileSync(
	'src/ui/view/composer/chrome/LinkPreviewLayer.tsx',
	'utf8',
);
const css = readFileSync('src/styles/composer.css', 'utf8');

assert.ok(root.includes('<ComposerSurfaceProvider value={surfaces}>'));
assert.ok(root.includes('data-composer-active-surface={surfaces.active?.kind}'));
assert.ok(link.includes('surfacePreviewOpenDelayMs'));
assert.ok(link.includes('surfacePointerTravelTolerancePx'));
assert.ok(link.includes("claimSurface({ id: surfaceId, kind: 'link'"));
assert.equal(link.includes('invokeLinkAction'), false);
assert.equal(link.includes('linkToEmbed'), false);
assert.equal(link.includes('explainRelation'), false);
assert.equal(link.includes('syncTargetPoints'), false);
assert.equal(link.includes('repairLink'), false);
assert.match(
	css,
	/\.pk-link-popover\s*\{[\s\S]*?max-width:\s*min\(300px/,
	'the settled link preview stays compact',
);
assert.equal(css.includes('pk-between-block-insert'), false, 'retired between-block chrome has no CSS');

console.log('composer-unified-insert-surfaces: passed');
