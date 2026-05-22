import type { ActionResult, CopilotAction, DocumentContext } from './CopilotActionRegistry';
import type {
	ArtifactProvenance,
	CapabilityArtifact,
	ChangeArtifact,
	ChangeBlockArtifact,
	InsightArtifact,
	SourceArtifact,
} from './CopilotRunArtifacts';
import type { CopilotProposals } from './CopilotOutputCollector';

interface AdapterInput {
	action: Pick<CopilotAction, 'id' | 'label'>;
	result: ActionResult;
	ctx?: DocumentContext;
}

interface LinkLikeItem {
	target?: string;
	path?: string;
	title?: string;
	reason?: string;
	context?: string;
	snippet?: string;
	excerpt?: string;
	confidence?: number;
	score?: number;
	similarityScore?: number;
}

function provenanceFor(action: Pick<CopilotAction, 'id' | 'label'>, item?: LinkLikeItem): ArtifactProvenance {
	return {
		capabilityId: action.id,
		label: action.label,
		sourcePath: item?.path ?? item?.target,
		sourceTitle: item?.title ?? item?.target,
		confidence: item?.confidence ?? item?.score ?? item?.similarityScore,
		signal: signalForAction(action.id),
	};
}

function signalForAction(actionId: string): ArtifactProvenance['signal'] {
	if (actionId.includes('semantic') || actionId.includes('connection')) return 'graph';
	if (actionId.includes('tag')) return 'tag';
	if (actionId.includes('task')) return 'task';
	if (actionId.includes('evidence') || actionId.includes('link') || actionId.includes('related')) return 'semantic';
	return 'agent';
}

function arrayFrom(value: unknown): any[] {
	return Array.isArray(value) ? value : [];
}

function compactText(value: unknown): string {
	if (typeof value === 'string') return value;
	if (value == null) return '';
	return JSON.stringify(value, null, 2);
}

function itemPath(item: LinkLikeItem): string {
	return item.path ?? item.target ?? item.title ?? 'Unknown source';
}

function itemTitle(item: LinkLikeItem): string {
	if (item.title) return item.title;
	const path = itemPath(item);
	return path.replace(/\.md$/, '').split('/').pop() ?? path;
}

function sourceFromItem(action: Pick<CopilotAction, 'id' | 'label'>, item: LinkLikeItem, index: number): SourceArtifact {
	const path = itemPath(item);
	const title = itemTitle(item);
	const provenance = [provenanceFor(action, item)];
	return {
		id: `${action.id}-source-${index}`,
		type: 'source',
		path,
		title,
		excerpt: item.excerpt ?? item.snippet ?? item.reason ?? item.context,
		provenance,
	};
}

function insightForStructured(
	action: Pick<CopilotAction, 'id' | 'label'>,
	data: any,
	title = action.label,
): InsightArtifact {
	const summary = compactText(data?.summary ?? data?.narrative ?? data?.overall ?? data);
	return {
		id: `${action.id}-insight`,
		type: 'insight',
		title,
		body: summary || 'The run completed without a text summary.',
		severity: 'info',
		provenance: [provenanceFor(action)],
		actions: [
			{ id: 'ask-follow-up', label: 'Ask follow-up', kind: 'ask-follow-up' },
			{ id: 'create-proposal', label: 'Create proposal', kind: 'create-proposal' },
		],
	};
}

function linkArtifacts(action: Pick<CopilotAction, 'id' | 'label'>, items: LinkLikeItem[], summary?: string): CapabilityArtifact[] {
	if (items.length === 0) {
		return [insightForStructured(action, { summary: summary ?? 'No related notes were found.' })];
	}

	const provenance = [provenanceFor(action)];
	const blocks: ChangeBlockArtifact[] = [{
		id: `${action.id}-links`,
		heading: 'Related links',
		before: '',
		after: items.map(item => `- [[${itemTitle(item)}]]${item.reason ? ` — ${item.reason}` : ''}`).join('\n'),
		provenance,
		selected: true,
	}];

	return [
		{
			id: `${action.id}-change`,
			type: 'change',
			title: action.label,
			provenance,
			blocks,
		},
		...items.map((item, index) => sourceFromItem(action, item, index)),
		insightForStructured(action, { summary: summary ?? `Prepared ${items.length} link proposal${items.length === 1 ? '' : 's'}.` }),
	];
}

function correctionArtifacts(action: Pick<CopilotAction, 'id' | 'label'>, data: any): CapabilityArtifact[] {
	const corrections = arrayFrom(data?.corrections);
	if (corrections.length === 0) return [insightForStructured(action, data)];

	const provenance = [provenanceFor(action)];
	const blocks: ChangeBlockArtifact[] = corrections.map((item, index) => ({
		id: `${action.id}-correction-${index}`,
		heading: item.type ? `Correction: ${item.type}` : 'Correction',
		before: compactText(item.original),
		after: compactText(item.corrected),
		provenance,
		selected: true,
	}));

	return [
		{
			id: `${action.id}-change`,
			type: 'change',
			title: action.label,
			provenance,
			blocks,
		},
		insightForStructured(action, {
			summary: data?.summary ?? corrections.map((item: any) => item.explanation).filter(Boolean).join('\n'),
		}),
	];
}

function evidenceArtifacts(action: Pick<CopilotAction, 'id' | 'label'>, data: any): CapabilityArtifact[] {
	const evidence = arrayFrom(data?.evidence);
	if (evidence.length === 0) return [insightForStructured(action, data)];

	const provenance = [provenanceFor(action)];
	const blocks: ChangeBlockArtifact[] = evidence.map((item, index) => ({
		id: `${action.id}-evidence-${index}`,
		heading: item.sourceTitle ? `Evidence: ${item.sourceTitle}` : 'Evidence',
		before: '',
		after: compactText(item.insertText ?? item.quote),
		provenance: [provenanceFor(action, {
			path: item.sourcePath,
			title: item.sourceTitle,
			confidence: item.relevance,
			excerpt: item.quote,
		})],
		selected: true,
	}));

	return [
		{
			id: `${action.id}-change`,
			type: 'change',
			title: action.label,
			provenance,
			blocks,
		},
		...evidence.map((item, index) => sourceFromItem(action, {
			path: item.sourcePath,
			title: item.sourceTitle,
			excerpt: item.quote,
			confidence: item.relevance,
		}, index)),
		insightForStructured(action, { summary: `Prepared ${evidence.length} evidence block${evidence.length === 1 ? '' : 's'}.` }),
	];
}

function tagArtifacts(action: Pick<CopilotAction, 'id' | 'label'>, data: any): CapabilityArtifact[] {
	const suggestions = arrayFrom(data?.suggestions);
	const body = suggestions.length === 0
		? data?.summary ?? 'No tag suggestions were found.'
		: suggestions.map(item => `#${item.tag ?? item.title ?? item.target}: ${item.reason ?? 'Suggested tag'}`).join('\n');
	return [{
		id: `${action.id}-insight`,
		type: 'insight',
		title: action.label,
		body,
		severity: 'info',
		provenance: [provenanceFor(action)],
		actions: [
			{ id: 'ask-follow-up', label: 'Ask follow-up', kind: 'ask-follow-up' },
			{ id: 'create-proposal', label: 'Create proposal', kind: 'create-proposal' },
		],
	}];
}

function scopedContent(ctx: DocumentContext): string {
	return ctx.scope === 'selection' && ctx.selection ? ctx.selection : ctx.content;
}

function streamAsChangeAction(actionId: string): boolean {
	return [
		'polish',
		'format-polish',
		'translate',
		'rewrite-selection',
	].includes(actionId);
}

export function actionResultToArtifacts({ action, result, ctx }: AdapterInput): CapabilityArtifact[] {
	if (result.type === 'error') {
		return [{
			id: `${action.id}-error`,
			type: 'trace',
			label: action.label,
			status: 'error',
			summary: result.message,
		}];
	}

	if (result.type === 'stream') {
		if (ctx && streamAsChangeAction(action.id)) {
			const provenance = [provenanceFor(action)];
			return [{
				id: `${action.id}-change`,
				type: 'change',
				title: action.label,
				provenance,
				blocks: [{
					id: `${action.id}-stream-change`,
					heading: ctx.scope === 'selection' ? 'Selected text' : 'Document content',
					before: scopedContent(ctx),
					after: result.text,
					provenance,
					selected: true,
				}],
			}];
		}

		return [{
			id: `${action.id}-insight`,
			type: 'insight',
			title: action.label,
			body: result.text || 'The run completed without visible text output.',
			severity: 'info',
			provenance: [provenanceFor(action)],
			actions: [
				{ id: 'ask-follow-up', label: 'Ask follow-up', kind: 'ask-follow-up' },
				{ id: 'create-proposal', label: 'Create proposal', kind: 'create-proposal' },
			],
		}];
	}

	const data = result.data;
	if (data?.evidence) return evidenceArtifacts(action, data);
	if (data?.corrections) return correctionArtifacts(action, data);
	if (action.id === 'suggest-tags') return tagArtifacts(action, data);

	const linkLikeItems = [
		...arrayFrom(data?.suggestions),
		...arrayFrom(data?.links),
		...arrayFrom(data?.connections),
	];
	if (linkLikeItems.length > 0 || action.id.includes('link') || action.id.includes('connection')) {
		return linkArtifacts(action, linkLikeItems, data?.summary);
	}

	const relatedItems = arrayFrom(data?.items);
	if (relatedItems.length > 0) {
		return [
			...relatedItems.map((item, index) => sourceFromItem(action, item, index)),
			insightForStructured(action, { summary: data?.summary ?? `Found ${relatedItems.length} related note${relatedItems.length === 1 ? '' : 's'}.` }),
		];
	}

	return [insightForStructured(action, data)];
}

// ─── Proposal → Artifact conversion (Phase 1 of meta-agent redesign) ────────

const METAAGENT_LABEL = 'Auto Review';
const METAAGENT_CAPABILITY_ID = 'auto-review-meta';

function metaProvenance(sourcePath?: string, sourceTitle?: string): ArtifactProvenance {
	return {
		capabilityId: METAAGENT_CAPABILITY_ID,
		label: METAAGENT_LABEL,
		sourcePath,
		sourceTitle,
		signal: 'agent',
	};
}

function pickSeverity(input: CopilotProposals['insights'][number]['severity']): InsightArtifact['severity'] {
	if (input === 'low' || input === 'medium' || input === 'high') return input;
	return 'info';
}

/**
 * Convert structured proposals (from CopilotOutputCollector) into UI artifacts.
 *
 * Preferred over `actionResultToArtifacts` whenever the agent ran via the
 * propose_* toolset. Loss-less mapping: every proposal becomes exactly one
 * artifact, no schema inference, no heuristic guessing.
 */
export function proposalsToArtifacts(proposals: CopilotProposals): CapabilityArtifact[] {
	const out: CapabilityArtifact[] = [];

	for (const insight of proposals.insights) {
		out.push({
			id: insight.id,
			type: 'insight',
			title: insight.title,
			body: insight.body,
			severity: pickSeverity(insight.severity),
			provenance: insight.provenance.map(path => metaProvenance(path, undefined)),
			actions: [
				{ id: 'ask-follow-up', label: 'Ask follow-up', kind: 'ask-follow-up' },
				{ id: 'create-proposal', label: 'Draft proposal', kind: 'create-proposal' },
			],
		} satisfies InsightArtifact);
	}

	for (const change of proposals.changes) {
		const provenance = change.provenance.map(path => metaProvenance(path, undefined));
		out.push({
			id: change.id,
			type: 'change',
			title: change.title,
			provenance,
			blocks: change.blocks.map((block, idx): ChangeBlockArtifact => ({
				id: `${change.id}-block-${idx}`,
				heading: block.heading,
				before: block.before,
				after: block.after,
				provenance: block.rationale
					? [metaProvenance(undefined, block.rationale)]
					: provenance,
				selected: true,
			})),
		} satisfies ChangeArtifact);
	}

	for (const source of proposals.sources) {
		out.push({
			id: source.id,
			type: 'source',
			path: source.path,
			title: source.path.replace(/\.md$/, '').split('/').pop() ?? source.path,
			excerpt: source.excerpt,
			provenance: [{
				...metaProvenance(source.path),
				confidence: source.weight,
			}],
		} satisfies SourceArtifact);
	}

	return out;
}

/** Did the agent actually publish anything? Used to decide when to fall back. */
export function hasMeaningfulProposals(proposals: CopilotProposals): boolean {
	return (
		proposals.insights.length > 0 ||
		proposals.changes.length > 0 ||
		proposals.sources.length > 0 ||
		proposals.chatFollowups.length > 0
	);
}
