import assert from 'assert';
import { readFileSync } from 'fs';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ComposerRoot } from '@/ui/view/composer/ComposerRoot';
import { BriefViewContent, type BriefViewContentProps } from '@/ui/view/composer/sidecar/CopilotView';
import { DEFAULT_SIDECAR_CONFIG } from '@/ui/view/composer/sidecar/sidecarConfig';
import { resolveSidecarHostMode, resolveSidecarMode } from '@/ui/view/composer/sidecar/IntelligenceSidecar';
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

function renderComposer(withIntelligence = false): string {
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
	return renderToStaticMarkup(React.createElement(ComposerRoot, {
		source,
		runtime: { session, hub },
		intelligence: withIntelligence ? makeRuntime() : undefined,
	}));
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
		related: { status: 'unavailable' },
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

check('BriefView imports the canonical Button primitive, not legacy shared-ui/button', () => {
	const source = readFileSync('src/ui/view/composer/sidecar/BriefView.tsx', 'utf8');
	assert.equal(source.includes("from '@/ui/component/shared-ui/button'"), false);
	assert.equal(source.includes("from '@/ui/components/primitives'"), true);
});

check('document paper starts with content, not decorative file metadata header', () => {
	const html = renderComposer();
	assert.equal(html.includes('pk-composer-header'), false);
	assert.equal(html.includes('Visual Parity Source.md'), false);
	assert.equal(html.includes(' blocks'), false);
	assert.ok(html.indexOf('pk-composer-blocks') > -1);
});

check('Frontmatter uses a persistent current-note picker instead of a block-row Vault table', () => {
	const frontmatter = readFileSync(
		'src/ui/view/composer/blocks/frontmatter/FrontmatterBlockView.tsx',
		'utf8',
	);
	const root = readFileSync('src/ui/view/composer/ComposerRoot.tsx', 'utf8');
	const actionRow = readFileSync('src/ui/view/composer/chrome/BlockActionRow.tsx', 'utf8');
	assert.ok(frontmatter.includes('className="pk-fm-add-property"'));
	assert.ok(frontmatter.includes('<FrontmatterPropertyPicker'));
	const picker = readFileSync(
		'src/ui/view/composer/blocks/frontmatter/FrontmatterPropertyPicker.tsx',
		'utf8',
	);
	assert.ok(picker.includes('selectVaultPropertyFields'));
	assert.equal(root.includes('vaultLibrary={'), false);
	assert.equal(actionRow.includes('data-action="vault-library"'), false);
	assert.ok(root.includes('[SUGGEST_PROPERTIES_CAPABILITY_ID]'));
});

check('block instruction restores the designed wand trigger and Spark plus History input lead', () => {
	const row = readFileSync('src/ui/view/composer/chrome/BlockActionRow.tsx', 'utf8');
	const css = readFileSync('src/styles/composer.css', 'utf8');
	assert.equal(row.includes('Terminal'), false);
	assert.ok(row.includes('icon={<WandSparkles size={13} />}'));
	assert.ok(row.includes('<Sparkles size={13} className="pk-block-action-row__spark"'));
	assert.ok(row.includes('<HistoryIcon size={13} className="pk-block-action-row__instruction-history"'));
	assert.match(
		css,
		/input\.pk-block-action-row__instruction\s*\{[\s\S]*?border:\s*0 !important;[\s\S]*?box-shadow:\s*none !important;/,
	);
});

check('block action row scrolls instead of silently clipping real quick actions', () => {
	const css = readFileSync('src/styles/composer.css', 'utf8');
	assert.match(
		css,
		/\.pk-block-action-row__shell\s*\{[\s\S]*?overflow-x:\s*auto;[\s\S]*?scrollbar-width:\s*none;/,
		'constrained block rows must keep every projected quick action reachable',
	);
	assert.match(
		css,
		/\.pk-block-action-row__options\s*\{[\s\S]*?max-width:\s*none;[\s\S]*?flex:\s*none;/,
		'the options rail must not truncate its own capability pills',
	);
});

check('insert-below uses one Markdown draft with preview and explicit AI acceptance', () => {
	const root = readFileSync('src/ui/view/composer/ComposerRoot.tsx', 'utf8');
	const actionRow = readFileSync('src/ui/view/composer/chrome/BlockActionRow.tsx', 'utf8');
	const draft = readFileSync('src/ui/view/composer/chrome/NewBlockDraft.tsx', 'utf8');
	const css = readFileSync('src/styles/composer.css', 'utf8');
	assert.ok(root.includes("panel: 'insert-draft'"));
	assert.ok(root.includes('pinned: boolean'));
	assert.ok(root.includes('previewPanel'));
	assert.ok(actionRow.includes('pk-insert-type-menu'));
	assert.ok(actionRow.includes('surfacePreviewCloseDelayMs'));
	assert.ok(actionRow.includes("onPointerEnter={() => showPreview('insert-menu')}"));
	assert.ok(actionRow.includes("onPointerEnter={() => showPreview('copy')}"));
	assert.ok(actionRow.includes("onPointerEnter={() => showPreview('history')}"));
	assert.ok(actionRow.includes('pk-block-action-row__interaction-zone'));
	assert.ok(actionRow.includes('onPointerEnter={clearPreviewClose}'));
	assert.ok(actionRow.includes('if (!openPanel || panelPinned) return;'));
	assert.equal(actionRow.includes("onPointerLeave={() => hidePreview('insert-menu')}"), false);
	assert.equal(actionRow.includes("onPointerLeave={() => hidePreview('copy')}"), false);
	assert.equal(actionRow.includes("onPointerLeave={() => hidePreview('history')}"), false);
	assert.equal(actionRow.includes('pk-block-action-row__expanded-surface--end'), false);
	assert.ok(actionRow.includes('pk-block-action-row__expanded-surface'));
	assert.equal(actionRow.includes("aria-label={instructionOpen ? a.instruction : 'Block actions'}"), false);
	assert.equal(actionRow.includes('Block actions'), false);
	assert.match(
		css,
		/\.pk-block-action-row__expanded-surface\s*\{[\s\S]*?display:\s*block;[\s\S]*?margin-top:\s*6px;/,
	);
	assert.match(
		css,
		/\.pk-block-action-row\[data-floating-surface\]\s*\{[\s\S]*?height:\s*auto;[\s\S]*?pointer-events:\s*auto;[\s\S]*?overflow:\s*visible;/,
		'an open secondary surface must keep its action row in normal layout',
	);
	assert.match(
		css,
		/\.pk-block-action-row__interaction-zone\s*\{[\s\S]*?width:\s*max-content;[\s\S]*?max-width:\s*100%;/,
		'the toolbar and its secondary surface must share one continuous hover owner',
	);
	assert.equal(css.includes('.pk-block-action-row__expanded-surface--end'), false);
	assert.match(
		css,
		/\.pk-insert-type-menu__item\s*\{[\s\S]*?border-radius:\s*var\(--pk-radius-pill\)[\s\S]*?background:\s*transparent/,
	);
	assert.match(
		css,
		/\.pk-insert-type-menu\s*\{[\s\S]*?flex-wrap:\s*nowrap;[\s\S]*?width:\s*max-content;[\s\S]*?overflow-x:\s*auto;/,
		'insert shortcuts should read as one compact toolbar rail, not a sparse option grid',
	);
	assert.ok(actionRow.includes('className="pk-action-capsule pk-insert-type-menu__item"'));
	const easyCopy = readFileSync('src/ui/view/composer/chrome/EasyCopyMenu.tsx', 'utf8');
	assert.ok(easyCopy.includes('className="pk-action-capsule pk-easy-copy__tile"'));
	assert.ok(draft.includes('StreamdownIsolated'));
	assert.ok(draft.includes('blockDraftGeneration'));
	assert.ok(draft.includes('config.acceptGenerated'));
	assert.ok(draft.includes('insertDraftSyntax'));
	assert.equal(draft.includes('selectedTypeId'), false);
	assert.equal(draft.includes('selectedType.blockKind'), false);
	assert.equal(draft.includes('lastUsed'), false);
	assert.equal(root.includes('insertDraftAfter'), false);
	assert.equal(draft.includes('onBlur={() => void commit()}'), false);
});

check('document controls share one non-overlay control bar', () => {
	const html = renderComposer();
	const css = readFileSync('src/styles/composer.css', 'utf8');
	const commentPanel = readFileSync('src/ui/view/composer/chrome/CommentPanel.tsx', 'utf8');
	const controlIndex = html.indexOf('pk-composer-controlbar');
	const undoIndex = html.indexOf('pk-undo-redo');
	const workspaceIndex = html.indexOf('pk-composer-workspace');
	assert.ok(controlIndex > -1, 'missing unified control bar');
	assert.ok(html.includes('pk-composer-display-switch'), 'the edit/clean display control must remain permanently available');
	assert.ok(undoIndex > controlIndex, 'undo/redo must stay in the unified control bar');
	assert.ok(controlIndex < workspaceIndex, 'control bar must participate in layout before the document workspace');
	const controlRule = css.match(/\.peak-composer-root \.pk-composer-controlbar\s*\{([\s\S]*?)\}/)?.[1] ?? '';
	assert.match(controlRule, /position:\s*sticky/, 'control bar must remain available while the document scrolls');
	assert.match(controlRule, /top:\s*0/, 'sticky control bar must attach to the Composer scrollport top');
	assert.equal(commentPanel.includes('pk-comment-rail__header'), false, 'comment rail must not cover its first card with a header');
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

check('all-empty Brief keeps the three persistent sections and no global empty replacement', () => {
	const html = renderBriefContent({
		runtime: makeRuntime() as never,
	});
	assert.equal(count(html, DEFAULT_SIDECAR_CONFIG.strings.emptyBrief), 0);
	assert.equal(count(html, 'class="pk-brief-section"'), 3);
	assert.ok(html.includes(DEFAULT_SIDECAR_CONFIG.strings.sectionNextMoves));
	assert.ok(html.includes(DEFAULT_SIDECAR_CONFIG.strings.sectionRelated));
	assert.ok(html.includes(DEFAULT_SIDECAR_CONFIG.strings.sectionUnplaced));
	assert.ok(html.includes(DEFAULT_SIDECAR_CONFIG.strings.sectionNextMovesEmpty));
	assert.ok(html.includes(DEFAULT_SIDECAR_CONFIG.strings.sectionRelatedUnavailable));
	assert.ok(html.includes(DEFAULT_SIDECAR_CONFIG.strings.sectionUnplacedEmpty));
	assert.equal(html.includes(DEFAULT_SIDECAR_CONFIG.strings.refreshRelated), false);
});

check('empty Brief with related loading state shows refreshRelated and all sections', () => {
	const html = renderBriefContent({
		runtime: makeRuntime() as never,
		related: { status: 'loading' },
	});
	assert.equal(html.includes(DEFAULT_SIDECAR_CONFIG.strings.refreshRelated), true);
	assert.equal(html.includes('pk-btn'), true);
	assert.equal(count(html, 'class="pk-brief-section"'), 3);
	assert.equal(count(html, DEFAULT_SIDECAR_CONFIG.strings.emptyBrief), 0);
	assert.ok(html.includes(DEFAULT_SIDECAR_CONFIG.strings.sectionRelatedLoading));
});

check('finding renders Next Moves while Related and Unplaced remain visible', () => {
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
	assert.equal(count(html, 'class="pk-brief-section"'), 3);
	assert.ok(html.includes(DEFAULT_SIDECAR_CONFIG.strings.sectionNextMoves));
	assert.equal(html.includes('<span class="pk-brief-section-title">相关材料</span>'), true);
	assert.equal(html.includes('<span class="pk-brief-section-title">还没安放的想法</span>'), true);
	assert.ok(html.includes('真实 finding reason'));
	assert.equal(html.includes(DEFAULT_SIDECAR_CONFIG.strings.emptyBrief), false);
	assert.equal(html.includes(DEFAULT_SIDECAR_CONFIG.strings.refreshRelated), false);
});

check('related ready state renders Related while other sections remain visible', () => {
	const html = renderBriefContent({
		runtime: makeRuntime() as never,
		findings: [],
		related: { status: 'ready', snapshot: makeRelatedSnapshot() },
	});
	assert.equal(count(html, 'class="pk-brief-section"'), 3);
	assert.equal(html.includes('<span class="pk-brief-section-title">相关材料</span>'), true);
	assert.equal(html.includes('<span class="pk-brief-section-title">接下来可能要做</span>'), true);
	assert.equal(html.includes('<span class="pk-brief-section-title">还没安放的想法</span>'), true);
	assert.equal(html.includes(DEFAULT_SIDECAR_CONFIG.strings.emptyBrief), false);
	assert.equal(html.includes(DEFAULT_SIDECAR_CONFIG.strings.refreshRelated), true);
});

check('Intelligence toggle lives in the unified Composer control bar', () => {
	const html = renderComposer(true);
	const controlIndex = html.indexOf('pk-composer-controlbar');
	const intelligenceIndex = html.indexOf('pk-composer-intelligence-toggle');
	assert.ok(intelligenceIndex > controlIndex, 'Intelligence toggle must live inside the unified control bar');
	assert.equal(html.includes('pk-sidecar-open-toggle'), false, 'sidecar must not render a detached floating reopen button');
	assert.ok(html.includes(`>${DEFAULT_SIDECAR_CONFIG.strings.title}</span>`), 'control bar must expose the Intelligence label');
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
