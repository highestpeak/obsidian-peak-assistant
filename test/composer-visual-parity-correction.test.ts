import assert from 'assert';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ComposerRoot } from '@/ui/view/composer/ComposerRoot';
import { BriefView } from '@/ui/view/composer/sidecar/CopilotView';
import { SidecarProvider } from '@/ui/view/composer/sidecar/SidecarContext';
import { DEFAULT_SIDECAR_CONFIG } from '@/ui/view/composer/sidecar/sidecarConfig';
import { resolveSidecarHostMode, resolveSidecarMode, SidecarOpenButton } from '@/ui/view/composer/sidecar/IntelligenceSidecar';
import { IntelligenceRuntime } from '@/service/composer';
import { hasReviewableCandidates } from '@/ui/view/composer/chrome/UndoRedoBar';
import type { ComposerStateSource, DocumentComposerState } from '@/core/composer';
import { FakeVault, makeHub, openSession } from './helpers/composer-fakes';

let checks = 0;

function check(name: string, fn: () => void): void {
	checks += 1;
	try {
		fn();
	} catch (err) {
		console.error(`  XX ${name}`);
		throw err;
	}
}

function count(haystack: string, needle: string): number {
	return haystack.split(needle).length - 1;
}

function renderComposer(): string {
	const vault = new FakeVault();
	const session = openSession(vault, 'Folder/Visual Parity Source.md', '# Real title\n\nFirst paragraph.\n');
	const hub = makeHub(vault, session);
	const state: DocumentComposerState = {
		status: 'loaded',
		filePath: session.filePath,
		snapshot: session.snapshot,
	};
	const source: ComposerStateSource = {
		getState: () => state,
		subscribe: () => () => undefined,
	};
	return renderToStaticMarkup(React.createElement(ComposerRoot, { source, runtime: { session, hub } }));
}

function makeRuntime(): IntelligenceRuntime {
	return new IntelligenceRuntime({ hub: { on: () => () => undefined } as never });
}

function renderBrief(runtime: IntelligenceRuntime): string {
	return renderToStaticMarkup(
		React.createElement(
			SidecarProvider,
			{ value: { runtime, config: DEFAULT_SIDECAR_CONFIG } },
			React.createElement(BriefView),
		),
	);
}

check('document paper starts with content, not decorative file metadata header', () => {
	const html = renderComposer();
	assert.equal(html.includes('pk-composer-header'), false);
	assert.equal(html.includes('Visual Parity Source.md'), false);
	assert.equal(html.includes(' blocks'), false);
	assert.ok(html.indexOf('pk-composer-blocks') > -1);
});

check('display state switch should be candidate-driven (no permanent chrome in empty brief state)', () => {
	const html = renderComposer();
	const statusIndex = html.indexOf('pk-composer-statusbar');
	const undoIndex = html.indexOf('pk-undo-redo');
	assert.ok(statusIndex > -1, 'missing statusbar');
	assert.equal(html.indexOf('pk-composer-display-switch'), -1, 'display switch should not be permanent in empty work queue');
	assert.ok(undoIndex > statusIndex, 'undo/redo must stay in the bottom statusbar family');
});

check('sidecar mode resolves from actual host width, not sidecar column or window width', () => {
	assert.equal(resolveSidecarMode(1040, 1180), 'drawer');
	assert.equal(resolveSidecarMode(1179, 1180), 'drawer');
	assert.equal(resolveSidecarMode(1180, 1180), 'desktop');
	let hostWidth = 1224;
	const host = {
		getBoundingClientRect: () => ({ width: hostWidth }),
	} as unknown as HTMLElement;
	const sidecar = {
		closest: (selector: string) => (selector === '.peak-composer-root' ? host : null),
		getBoundingClientRect: () => ({ width: 430 }),
	} as unknown as HTMLElement;
	assert.equal(resolveSidecarHostMode(sidecar, 1180), 'desktop');
	hostWidth = 900;
	assert.equal(resolveSidecarHostMode(sidecar, 1180), 'drawer');
});

check('all-empty Brief renders one consolidated empty state, not three repeated rows', () => {
	const html = renderBrief(makeRuntime());
	assert.equal(count(html, DEFAULT_SIDECAR_CONFIG.strings.emptyBrief), 1);
	assert.equal(count(html, 'class="pk-brief-section"'), 0);
	assert.ok(html.includes('pk-brief-empty-state'));
	assert.ok(html.includes(DEFAULT_SIDECAR_CONFIG.strings.refreshBrief));
});

check('populated Brief keeps the three semantic sections without invented empty rows', () => {
	const runtime = makeRuntime();
	runtime.ingestFinding({
		fingerprint: 'fp-1',
		evidenceRevision: 'r1',
		target: { kind: 'block', blockId: 'para-1' },
		reason: '真实 finding reason',
		capabilityId: 'composer.prose.polish',
	});
	const html = renderBrief(runtime);
	assert.equal(count(html, 'class="pk-brief-section"'), 3);
	assert.ok(html.includes(DEFAULT_SIDECAR_CONFIG.strings.sectionNextMoves));
	assert.ok(html.includes(DEFAULT_SIDECAR_CONFIG.strings.sectionRelated));
	assert.ok(html.includes(DEFAULT_SIDECAR_CONFIG.strings.sectionUnplaced));
	assert.ok(html.includes('真实 finding reason'));
	assert.equal(html.includes(DEFAULT_SIDECAR_CONFIG.strings.emptyBrief), false);
});

check('refresh action remains available in empty brief to retrigger related-material runtime', () => {
	const html = renderBrief(makeRuntime());
	const updateAction = DEFAULT_SIDECAR_CONFIG.strings.refreshBrief;
	const marker = `>${updateAction}</button>`;
	assert.equal(html.includes(marker), true, 'empty brief should show refresh action and keep source-backed behavior');
});

check('closed sidecar entry renders a restrained visible Intelligence Button', () => {
	const html = renderToStaticMarkup(
		React.createElement(SidecarOpenButton, {
			label: DEFAULT_SIDECAR_CONFIG.strings.title,
			'aria-label': DEFAULT_SIDECAR_CONFIG.strings.openDrawer,
			onClick: () => undefined,
		}),
	);
	assert.ok(html.includes('pk-btn'), 'closed entry must use the shared Button primitive');
	assert.ok(html.includes('pk-sidecar-open-toggle'), 'closed entry must use the shared sidecar-open class');
	assert.ok(html.includes(`aria-label="${DEFAULT_SIDECAR_CONFIG.strings.openDrawer}"`), 'closed entry must keep openDrawer aria-label');
	assert.ok(html.includes(`>${DEFAULT_SIDECAR_CONFIG.strings.title}</span>`), 'closed entry must expose a visible Intelligence label');
});

check('status switch in the composer bar should track stale candidates as reviewable', () => {
	assert.equal(
		hasReviewableCandidates([{ status: 'ready' }, { status: 'stale' }, { status: 'accepted' }]),
		true,
		'ready and stale should both show reviewable switch',
	);
	assert.equal(hasReviewableCandidates([{ status: 'accepted' }, { status: 'discarded' }, { status: 'failed' }]), false, 'done/final states should not trigger review switch');
});

console.log(`composer-visual-parity-correction: ${checks}/${checks} checks passed`);
