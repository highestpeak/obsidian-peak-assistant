import assert from 'assert';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ComposerRoot } from '@/ui/view/composer/ComposerRoot';
import { BriefViewContent, type BriefViewContentProps } from '@/ui/view/composer/sidecar/CopilotView';
import { DEFAULT_SIDECAR_CONFIG } from '@/ui/view/composer/sidecar/sidecarConfig';
import { resolveSidecarHostMode, resolveSidecarMode, SidecarOpenButton } from '@/ui/view/composer/sidecar/IntelligenceSidecar';
import { buildRelatedSnapshot, IntelligenceRuntime } from '@/service/composer';
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

function renderBriefContent(props: Partial<BriefViewContentProps> & Pick<BriefViewContentProps, 'runtime'>): string {
	const fullProps: BriefViewContentProps = {
		config: DEFAULT_SIDECAR_CONFIG,
		findings: [],
		modalOpen: false,
		onLocate: undefined,
		onOpenSource: undefined,
		onRefreshRelated: () => undefined,
		related: null,
		relatedPortAvailable: false,
		setModalOpen: () => undefined,
		...props,
	};
	return renderToStaticMarkup(React.createElement(BriefViewContent, fullProps));
}

function makeRelatedSnapshot() {
	return buildRelatedSnapshot({
		focus: { anchorId: 'para-1', rootNodeId: 'doc.md' },
		revision: 'rev-1',
		items: [
			{
				id: 'related-1',
				type: 'markdown',
				title: 'Related item',
				path: 'notes/related-item.md',
				lastModified: 0,
				finalScore: 0.9,
			},
		],
		graphNodeCap: 1,
	});
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

check('all-empty Brief with no related port renders one consolidated empty state and no refresh', () => {
	const html = renderBriefContent({
		runtime: makeRuntime() as never,
	});
	assert.equal(count(html, DEFAULT_SIDECAR_CONFIG.strings.emptyBrief), 1);
	assert.equal(count(html, 'class="pk-brief-section"'), 0);
	assert.ok(html.includes('pk-brief-empty-state'));
	assert.equal(html.includes(DEFAULT_SIDECAR_CONFIG.strings.refreshRelated), false);
});

check('empty Brief with related port shows refreshRelated and still no sections', () => {
	const html = renderBriefContent({
		runtime: makeRuntime() as never,
		relatedPortAvailable: true,
	});
	assert.equal(html.includes(DEFAULT_SIDECAR_CONFIG.strings.refreshRelated), true);
	assert.equal(count(html, 'class="pk-brief-section"'), 0);
	assert.equal(count(html, DEFAULT_SIDECAR_CONFIG.strings.emptyBrief), 1);
});

check('only finding renders Next Moves and nothing else', () => {
	const runtime = makeRuntime();
	runtime.ingestFinding({
		fingerprint: 'fp-1',
		evidenceRevision: 'r1',
		target: { kind: 'block', blockId: 'para-1' },
		reason: '真实 finding reason',
		capabilityId: 'composer.prose.polish',
	});
	const html = renderBriefContent({
		runtime: runtime as never,
		findings: runtime.findings.list(),
	});
	assert.equal(count(html, 'class="pk-brief-section"'), 1);
	assert.ok(html.includes(DEFAULT_SIDECAR_CONFIG.strings.sectionNextMoves));
	assert.equal(html.includes('<span class="pk-brief-section-title">相关材料</span>'), false);
	assert.equal(html.includes('<span class="pk-brief-section-title">还没安放的想法</span>'), false);
	assert.ok(html.includes('真实 finding reason'));
	assert.equal(html.includes(DEFAULT_SIDECAR_CONFIG.strings.emptyBrief), false);
	assert.equal(html.includes(DEFAULT_SIDECAR_CONFIG.strings.refreshRelated), false);
});

check('only related renders Related and nothing else', () => {
	const html = renderBriefContent({
		runtime: makeRuntime() as never,
		findings: [],
		related: makeRelatedSnapshot(),
		relatedPortAvailable: true,
	});
	assert.equal(count(html, 'class="pk-brief-section"'), 1);
	assert.equal(html.includes('<span class="pk-brief-section-title">相关材料</span>'), true);
	assert.equal(html.includes('<span class="pk-brief-section-title">接下来可能要做</span>'), false);
	assert.equal(html.includes('<span class="pk-brief-section-title">还没安放的想法</span>'), false);
	assert.equal(html.includes(DEFAULT_SIDECAR_CONFIG.strings.emptyBrief), false);
	assert.equal(html.includes(DEFAULT_SIDECAR_CONFIG.strings.refreshRelated), true);
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
