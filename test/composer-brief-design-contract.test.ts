import assert from 'assert';
import { readFileSync } from 'fs';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BriefViewContent, type BriefViewContentProps } from '@/ui/view/composer/sidecar/CopilotView';
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
				finalScore: 0.92,
			},
			{
				id: 'source-b',
				type: 'markdown',
				title: 'Source B',
				path: 'sources/b.md',
				lastModified: 0,
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
	assert.ok(html.includes('pk-sensing-control'));
	assert.equal(count(html, 'data-finding-id='), DEFAULT_SIDECAR_CONFIG.briefPreviewCap);
	assert.ok(html.includes('pk-suggestion-row--primary'));
	assert.ok(html.includes('pk-suggestion-title'));
	assert.ok(html.includes('pk-suggestion-summary'));
	assert.ok(html.includes('pk-suggestion-meta'));
	assert.ok(html.includes('pk-suggestion-more'));
	assert.ok(html.includes(DEFAULT_SIDECAR_CONFIG.strings.moveLater));
	assert.ok(html.includes(DEFAULT_SIDECAR_CONFIG.strings.ignoreThisRound));
	assert.ok(html.includes('查看全部 5 条建议'));
	assert.ok(html.includes('v1'), 'Brief should show a compact human refresh version');
	assert.ok(html.includes('r-source-hash-for-tooltip'), 'full source revision remains inspectable as a tooltip');
	assert.equal(html.includes('38'), false, 'production must not ship the design fixture count');
});

check('Brief projects a frozen real related snapshot as an inline graph and full-view action', () => {
	const runtime = makeRuntime();
	const html = renderBrief({
		runtime,
		brief: runtime.brief.projection(),
		related: { status: 'ready', snapshot: relatedSnapshot() },
	});
	assert.ok(html.includes('pk-related-inline-graph'));
	assert.ok(html.includes('pk-material-node'));
	assert.ok(html.includes('Source A'));
	assert.ok(html.includes(DEFAULT_SIDECAR_CONFIG.strings.sourceDetails));
	assert.ok(html.includes(DEFAULT_SIDECAR_CONFIG.strings.viewSource));
	assert.ok(html.includes(DEFAULT_SIDECAR_CONFIG.strings.bringIntoSession));
	assert.ok(html.includes(DEFAULT_SIDECAR_CONFIG.strings.openFullView));
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
	assert.ok(html.includes('真实 session insight'));
	assert.ok(html.includes(DEFAULT_SIDECAR_CONFIG.strings.organizeThought));
});

check('Brief distinguishes manual sensing and does not present unavailable auto-prepare as enabled', () => {
	const runtime = makeRuntime();
	runtime.brief.setSensingMode('manual');
	const html = renderBrief({ runtime, brief: runtime.brief.projection() });
	assert.ok(html.includes(DEFAULT_SIDECAR_CONFIG.strings.manualChecking));
	assert.ok(html.includes(DEFAULT_SIDECAR_CONFIG.strings.sensingManualHint));
	assert.ok(html.includes(DEFAULT_SIDECAR_CONFIG.strings.autoPrepareUnavailable));
	assert.ok(html.includes('disabled=""'));
});

check('Brief CSS prevents content from entering the fixed action column', () => {
	const css = readFileSync('src/styles/composer-sidecar.css', 'utf8');
	const view = readFileSync('src/ui/view/composer/sidecar/BriefView.tsx', 'utf8');
	assert.ok(css.includes('.pk-suggestion-copy'));
	assert.ok(css.includes('overflow-wrap: anywhere;'));
	assert.ok(css.includes('grid-template-columns: 30px minmax(0, 1fr) auto;'));
	assert.ok(css.includes('.pk-suggestion-actions'));
	assert.ok(css.includes('.pk-suggestion-target'));
	assert.ok(css.includes('padding: 0 !important;'));
	assert.equal(css.includes('.pk-finding-reason'), false, 'the long reason may not be a content button');
	assert.equal(view.includes('pk-finding-reason'), false);
	assert.ok(view.includes('<article'));
	assert.ok(view.includes('<details className="pk-suggestion-more">'));
});

check('Brief keeps related cards and the real CodeMirror prompt within the sidecar layout contract', () => {
	const css = readFileSync('src/styles/composer-sidecar.css', 'utf8');
	assert.match(
		css,
		/\.pk-material-node\s*\{[\s\S]*?display:\s*flex !important;[\s\S]*?flex-direction:\s*column;/,
		'related material title and score must stack inside a narrow node',
	);
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
