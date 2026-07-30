import assert from 'assert';
import { readFileSync } from 'fs';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
	BriefViewContent,
	SensingControl,
	type BriefViewContentProps,
} from '@/ui/view/composer/sidecar/CopilotView';
import { DEFAULT_SIDECAR_CONFIG } from '@/ui/view/composer/sidecar/sidecarConfig';
import { buildRelatedSnapshot, IntelligenceRuntime } from '@/service/composer';

let checks = 0;

function check(name: string, run: () => void): void {
	checks += 1;
	try {
		run();
	} catch (error) {
		console.error(`  XX ${name}`);
		throw error;
	}
}

function count(value: string, fragment: string): number {
	return value.split(fragment).length - 1;
}

function makeRuntime(): IntelligenceRuntime {
	return new IntelligenceRuntime({ hub: { on: () => () => undefined } as never });
}

function renderBrief(props: Partial<BriefViewContentProps> & Pick<BriefViewContentProps, 'runtime'>): string {
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

function ingestFinding(runtime: IntelligenceRuntime, index: number): void {
	runtime.ingestFinding({
		fingerprint: `brief-finding-${index}`,
		evidenceRevision: 'revision-1',
		target: { kind: 'block', blockId: `block-${index}` },
		reason: `原始建议 ${index}`,
		brief: {
			title: `建议标题 ${index}`,
			summary: `这是一条有真实来源的建议摘要 ${index}。`,
			targetLabel: `第 ${index} 个正文块`,
			evidenceLabel: '当前正文中的未完成任务',
			priority: index,
		},
	});
}

function relatedSnapshot() {
	return buildRelatedSnapshot({
		focus: { anchorId: 'block-1', rootNodeId: 'current.md' },
		revision: 'revision-1',
		items: [
			{
				id: 'source-a',
				type: 'markdown',
				title: 'Source A',
				path: 'sources/a.md',
				lastModified: 0,
				content: 'Source A provides the concrete interaction boundary for the current suggestion.',
				finalScore: 0.92,
			},
			{
				id: 'source-b',
				type: 'markdown',
				title: 'Source B',
				path: 'sources/b.md',
				lastModified: 0,
				content: 'Source B explains the review and acceptance workflow.',
				finalScore: 0.81,
			},
		],
		graphNodeCap: 6,
		reasonBySourceId: { 'source-a': '同一主题', 'source-b': '被当前任务引用' },
	});
}

check('Brief uses the design-source head/actions/structured suggestion hierarchy', () => {
	const runtime = makeRuntime();
	runtime.brief.markRefreshed('r-source-hash-for-tooltip', 0);
	for (let index = 1; index <= 5; index += 1) ingestFinding(runtime, index);
	const html = renderBrief({ runtime, findings: runtime.findings.list(), brief: runtime.brief.projection() });
	assert.ok(html.includes('pk-brief-status'));
	assert.ok(html.includes('pk-brief-head-actions'));
	assert.ok(html.includes(DEFAULT_SIDECAR_CONFIG.strings.askCopilot));
	assert.ok(html.includes(DEFAULT_SIDECAR_CONFIG.strings.refreshSuggestions));
	assert.equal(
		html.includes('pk-sensing-control'),
		false,
		'update policy belongs beside Scope in the compact context row, not in the Brief actions',
	);
	assert.ok(
		readFileSync('src/ui/view/composer/sidecar/IntelligenceSidecar.tsx', 'utf8')
			.includes('<SensingControl'),
		'the sidecar context row must render the update policy control',
	);
	assert.equal(count(html, 'data-finding-id='), DEFAULT_SIDECAR_CONFIG.briefPreviewCap);
	assert.ok(html.includes('pk-suggestion-row--primary'));
	assert.ok(html.includes('pk-suggestion-title'));
	assert.ok(html.includes('pk-suggestion-summary'));
	assert.ok(html.includes('pk-suggestion-meta'));
	assert.ok(html.includes('pk-suggestion-inline-actions'));
	assert.ok(html.includes(DEFAULT_SIDECAR_CONFIG.strings.moveLater));
	assert.equal(html.includes('pk-suggestion-more'), false, 'row actions must not hide behind an oversized overflow menu');
	assert.ok(html.includes('查看全部 5 条建议'));
	assert.ok(html.includes('v1'), 'Brief should show a compact human refresh version');
	assert.ok(html.includes('r-source-hash-for-tooltip'), 'full source revision remains inspectable as a tooltip');
	assert.equal(html.includes('38'), false, 'production must not ship the design fixture count');
});

check('Brief projects a frozen related snapshot as a readable hover-preview list and full-view action', () => {
	const runtime = makeRuntime();
	const html = renderBrief({
		runtime,
		brief: runtime.brief.projection(),
		related: { status: 'ready', snapshot: relatedSnapshot() },
	});
	assert.ok(html.includes('pk-related-material-list'));
	assert.ok(html.includes('pk-material-row'));
	assert.ok(html.includes('pk-material-detail-excerpt'));
	assert.ok(html.includes('Source A'));
	assert.ok(html.includes('Source A provides the concrete interaction boundary'));
	assert.ok(html.includes(DEFAULT_SIDECAR_CONFIG.strings.materialListTitle));
	assert.ok(html.includes(DEFAULT_SIDECAR_CONFIG.strings.materialHoverHint));
	assert.ok(html.includes(DEFAULT_SIDECAR_CONFIG.strings.viewSource));
	assert.ok(html.includes(DEFAULT_SIDECAR_CONFIG.strings.bringIntoSession));
	assert.ok(html.includes(DEFAULT_SIDECAR_CONFIG.strings.openFullView));
	assert.equal(html.includes('pk-related-inline-graph'), false);
	assert.equal(html.includes('pk-material-graph-network'), false);
});

check('Brief clearly labels design-preview materials and thoughts as non-production data', () => {
	const runtime = makeRuntime();
	const brief = {
		...runtime.brief.projection(),
		unplacedThoughts: [{
			thoughtId: 'preview-thought',
			runId: 'design-preview',
			insightId: 'preview-thought',
			label: '示例想法',
			detail: '只用于设计验收',
			state: 'active' as const,
		}],
	};
	const html = renderBrief({
		runtime,
		brief,
		related: { status: 'ready', snapshot: relatedSnapshot() },
		relatedPreviewActive: true,
		thoughtPreviewActive: true,
	});
	assert.equal(count(html, 'pk-preview-badge'), 2);
	assert.ok(html.includes(DEFAULT_SIDECAR_CONFIG.strings.previewFixtureLabel));
	assert.ok(html.includes(DEFAULT_SIDECAR_CONFIG.strings.previewFixtureNote));
	assert.ok(html.includes('示例想法'));
});

check('Brief does not open an empty full-browser shell when no related material exists', () => {
	const runtime = makeRuntime();
	const empty = buildRelatedSnapshot({
		focus: { anchorId: 'block-1', rootNodeId: 'current.md' },
		revision: 'revision-1',
		items: [],
		graphNodeCap: 6,
	});
	const html = renderBrief({
		runtime,
		brief: runtime.brief.projection(),
		related: { status: 'ready', snapshot: empty },
	});
	assert.ok(html.includes(DEFAULT_SIDECAR_CONFIG.strings.sectionRelatedEmpty));
	assert.equal(
		html.includes(DEFAULT_SIDECAR_CONFIG.strings.openFullView),
		false,
		'an empty related snapshot must not offer a modal that can only be blank',
	);
});

check('Brief projects actual session insights as unplaced thoughts, not a hard-coded zero', () => {
	const runtime = makeRuntime();
	runtime.session.openSession('收集想法');
	const frozen = runtime.session.send({
		snapshot: {
			documentId: 'doc',
			revision: 'revision-1',
			target: { kind: 'document', documentId: 'doc' },
			targetSource: '',
			nearby: { before: '', after: '' },
		},
		targetQuote: '收集想法',
	});
	runtime.session.markNoChange(frozen.runId, {
		insights: [{ id: 'insight-1', label: '真实 session insight', detail: '来自这个 run 的证据。' }],
	});
	const brief = runtime.brief.projection();
	assert.equal(brief.unplacedThoughts.length, 1);
	const html = renderBrief({ runtime, brief });
	assert.ok(html.includes('pk-thought-row'));
	assert.ok(html.includes('pk-thought-preview'));
	assert.ok(html.includes('run ' + frozen.runId));
	assert.ok(html.includes('真实 session insight'));
	assert.ok(html.includes(DEFAULT_SIDECAR_CONFIG.strings.organizeThought));
	assert.ok(html.includes(DEFAULT_SIDECAR_CONFIG.strings.bringIntoSession));
});

check('Brief distinguishes manual sensing and does not present unavailable auto-prepare as enabled', () => {
	const runtime = makeRuntime();
	runtime.brief.setSensingMode('manual');
	const html = renderBrief({ runtime, brief: runtime.brief.projection() });
	const sensingHtml = renderToStaticMarkup(React.createElement(SensingControl, {
		runtime,
		sensingMode: runtime.brief.projection().sensingMode,
		autoPrepare: runtime.brief.projection().autoPrepare,
		autoPrepareAvailable: runtime.brief.projection().autoPrepareAvailable,
		strings: DEFAULT_SIDECAR_CONFIG.strings,
	}));
	assert.ok(html.includes(DEFAULT_SIDECAR_CONFIG.strings.manualChecking));
	assert.ok(html.includes(DEFAULT_SIDECAR_CONFIG.strings.sensingManualHint));
	assert.ok(sensingHtml.includes(DEFAULT_SIDECAR_CONFIG.strings.autoPrepareUnavailable));
	assert.ok(sensingHtml.includes('disabled=""'));
});

check('Brief gives long titles the content width and keeps actions in the metadata footer', () => {
	const css = readFileSync('src/styles/composer-sidecar.css', 'utf8');
	const view = readFileSync('src/ui/view/composer/sidecar/BriefView.tsx', 'utf8');
	assert.ok(css.includes('.pk-suggestion-copy'));
	assert.ok(css.includes('overflow-wrap: anywhere;'));
	assert.ok(css.includes('grid-template-columns: 30px minmax(0, 1fr);'));
	assert.ok(css.includes('-webkit-line-clamp: 2;'));
	assert.ok(css.includes('.pk-suggestion-footer'));
	assert.ok(css.includes('.pk-suggestion-inline-actions'));
	assert.ok(css.includes('.pk-suggestion-target'));
	assert.ok(css.includes('padding: 0 !important;'));
	assert.equal(css.includes('.pk-finding-reason'), false, 'the long reason may not be a content button');
	assert.equal(view.includes('pk-finding-reason'), false);
	assert.ok(view.includes('<article'));
	assert.ok(view.includes('pk-suggestion-footer'));
	assert.ok(view.includes('pk-suggestion-inline-actions'));
	assert.equal(view.includes('<details className="pk-suggestion-more">'), false);
});

check('Brief keeps related rows and the real CodeMirror prompt within the sidecar layout contract', () => {
	const css = readFileSync('src/styles/composer-sidecar.css', 'utf8');
	const view = readFileSync('src/ui/view/composer/sidecar/BriefView.tsx', 'utf8');
	assert.match(
		css,
		/\.pk-material-row\s*\{[\s\S]*?display:\s*grid !important;[\s\S]*?min-height:\s*50px !important;/,
		'related material rows must retain a readable hit target inside the narrow sidecar',
	);
	assert.ok(view.includes('onMouseEnter={() => setPreviewedId(node.sourceId)}'));
	assert.ok(view.includes('onMouseLeave={() => setPreviewedId(null)}'));
	assert.ok(view.includes('onClick={() => setPinnedId(node.sourceId)}'));
	assert.equal(css.includes('radial-gradient(var(--pk-border-soft)'), false);
	assert.match(
		css,
		/\.pk-prompt-editor \.pktw-codemirror-custom \.cm-content\s*\{[\s\S]*?min-height:\s*48px !important;[\s\S]*?max-height:\s*128px !important;/,
		'sidecar session input must override the generic CodeMirror 60–200px range',
	);
	assert.ok(
		css.includes('.peak-design-root.pk-sidecar-shell :is(button, summary):focus-visible'),
		'sidecar controls must restore focus visibility after the Obsidian reset',
	);
	assert.match(
		css,
		/\.pk-sensing-option-copy strong em\s*\{[\s\S]*?font-size:\s*8px;[\s\S]*?font-style:\s*normal;/,
		'the recommended sensing label must remain a compact accent annotation',
	);
});

console.log(`composer-brief-design-contract: ${checks}/${checks} checks passed`);
