/**
 * Peak Harness tools exposing the copilot output contract.
 *
 * Tools:
 *   propose_insight        — publish an analytical finding
 *   propose_change         — propose editable diffs
 *   propose_source         — cite a vault note as supporting evidence
 *   attach_chat_followup   — queue a follow-up question for the chat tab
 *   note_finding           — record a mid-flight observation (also echoed back)
 *   submit_review          — terminate current round (and optionally request another)
 *
 * Every tool funnels into a `CopilotOutputCollector`. Tool-result text is
 * deliberately kept compact except for `note_finding`, which echoes its own
 * text back so the agent remembers it across turns (decision I1).
 */

import { z } from 'zod';
import { ok, type ToolDef } from '@/core/types/tool';
import type { CopilotOutputCollector } from './CopilotOutputCollector';

export interface CopilotOutputToolsOptions {
	collector: CopilotOutputCollector;
	/** Optional notifier; called whenever submit_review fires. */
	onSubmitReview?: (submission: { summary: string; modeUsed: 'fast' | 'complete'; continue: boolean; continueRationale?: string }) => void;
}

function ackText(payload: unknown): { content: Array<{ type: 'text'; text: string }> } {
	return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }] };
}

function defineCopilotTool<TShape extends z.ZodRawShape>(
	name: string,
	description: string,
	shape: TShape,
	execute: (input: z.infer<z.ZodObject<TShape>>) => Promise<unknown>,
): ToolDef {
	return {
		name: `mcp__copilot__${name}`,
		description,
		inputSchema: z.object(shape),
		source: 'local',
		kind: name === 'submit_review' ? 'meta' : 'read',
		async execute(input) {
			return ok(await execute(input));
		},
	};
}

export function buildCopilotOutputTools(options: CopilotOutputToolsOptions): ToolDef[] {
	const { collector, onSubmitReview } = options;

	const proposeInsight = defineCopilotTool(
		'propose_insight',
		[
			'Publish an analytical finding that should appear in the Insights tab of the review.',
			'Call this once you have something concrete to say. Each call creates one independent insight card.',
			'`provenance` should list the vault paths you read to reach this conclusion (helps the user audit).',
			'`followUpQuestions` are optional prompts shown to the user; leave empty if none.',
		].join(' '),
		{
			title: z.string().min(2).max(120).describe('Short headline; appears as the insight card title.'),
			body: z.string().min(10).describe('Markdown body. Use bullet lists / headings if it aids clarity.'),
			severity: z.enum(['info', 'low', 'medium', 'high']).default('info'),
			provenance: z.array(z.string()).default([]).describe('Vault paths or anchors that backed this insight.'),
			followUpQuestions: z.array(z.string()).max(5).default([]).describe('Up to 5 follow-up questions for the user.'),
		},
		async (input) => {
			const inserted = collector.addInsight({
				title: input.title,
				body: input.body,
				severity: input.severity,
				provenance: input.provenance,
				followUpQuestions: input.followUpQuestions,
			});
			return ackText({ acknowledged: true, id: inserted.id, totalInsights: collector.getSnapshot().insights.length });
		},
	);

	const proposeChange = defineCopilotTool(
		'propose_change',
		[
			'Propose concrete edits to the user\'s document. Appears in the Changes tab and can be applied with one click.',
			'A `propose_change` is a THEMED bundle of one or more `blocks`. Each block is one concrete edit.',
			'Grouping rule: blocks sharing a theme (e.g. "fix all broken wikilinks") belong in ONE propose_change call. Distinct themes get separate propose_change calls.',
			'**One identified issue = one block.** If you see 10 fixable problems across 3 themes, the right output is 3 propose_change calls totaling 10 blocks — not "one big call with 3 blocks" hiding 7 unaddressed issues.',
			'Each block has `before` (existing text — must be an EXACT substring of the subject note — or "" if inserting new) and `after` (replacement / new text).',
			'Provide `rationale` for each block so the user understands why.',
			'Any [[wikilinks]] in `after` MUST target real .md notes you have verified exist (via vault_read_folder or similar). Folders are NOT valid wikilink targets.',
		].join(' '),
		{
			title: z.string().min(2).max(120),
			blocks: z.array(
				z.object({
					heading: z.string().describe('Local section / paragraph the block touches.'),
					before: z.string().describe('Original text (empty string if pure insertion).'),
					after: z.string().describe('Replacement text.'),
					rationale: z.string().optional(),
				}),
			).min(1),
			provenance: z.array(z.string()).default([]),
		},
		async (input) => {
			const inserted = collector.addChange({
				title: input.title,
				blocks: input.blocks.map(b => ({
					heading: b.heading,
					before: b.before,
					after: b.after,
					rationale: b.rationale,
				})),
				provenance: input.provenance,
			});
			return ackText({ acknowledged: true, id: inserted.id, blockCount: input.blocks.length });
		},
	);

	const proposeSource = defineCopilotTool(
		'propose_source',
		[
			'Cite a vault note as supporting evidence. Appears in the Sources tab.',
			'Use this when an existing note materially backed up an insight — gives the user a click-through audit trail.',
			'PATH MUST be a real .md note file you actually read, NEVER a folder path.',
		].join(' '),
		{
			path: z.string().describe('Vault path of the note (.md file, not a folder).'),
			excerpt: z.string().min(1).max(2000),
			relevance: z.string().describe('One sentence: why this source is relevant to the review.'),
			weight: z.number().min(0).max(1).default(0.5).describe('How central this source is, 0-1.'),
		},
		async (input) => {
			const inserted = collector.addSource({
				path: input.path,
				excerpt: input.excerpt,
				relevance: input.relevance,
				weight: input.weight,
			});
			return ackText({ acknowledged: true, id: inserted.id });
		},
	);

	const attachChatFollowup = defineCopilotTool(
		'attach_chat_followup',
		'Queue a follow-up question to surface in the Chat tab so the user can keep exploring. Use when you noticed something worth a deeper conversation but it does not belong in an insight.',
		{
			question: z.string().min(4).max(280),
			rationale: z.string().describe('Why this is worth asking.'),
		},
		async (input) => {
			const inserted = collector.addChatFollowup({
				question: input.question,
				rationale: input.rationale,
			});
			return ackText({ acknowledged: true, id: inserted.id });
		},
	);

	const noteFinding = defineCopilotTool(
		'note_finding',
		[
			'Record a mid-flight observation — not a final insight, just a thought you want to remember.',
			'These do NOT appear in user-facing tabs. They are echoed back to you so you do not re-read the same file twice.',
			'Use as often as useful — including a pre-submit self-check enumerating every issue you spotted, to verify each has a corresponding propose_change block.',
		].join(' '),
		{
			text: z.string().min(4).max(600),
		},
		async (input) => {
			collector.addFinding(input.text);
			// Echo the text back so the agent's transcript memory preserves it.
			return { content: [{ type: 'text' as const, text: `Finding recorded: ${input.text}` }] };
		},
	);

	const submitReview = defineCopilotTool(
		'submit_review',
		[
			'Terminate the current review round. Call this exactly once when you believe the round is complete.',
			'`continue=true` requests another round with a compacted transcript — useful if you want to explore a different angle without burning more turns of this round.',
			'`continue=false` ends the entire review session.',
		].join(' '),
		{
			summary: z.string().min(10).max(500).describe('2-4 sentence summary of what this round produced.'),
			modeUsed: z.enum(['fast', 'complete']),
			continue: z.boolean().describe('true = compact this round and start a fresh one; false = end review.'),
			continueRationale: z.string().optional().describe('If continue=true, briefly state what angle the next round should explore.'),
		},
		async (input) => {
			collector.recordSubmission({
				summary: input.summary,
				modeUsed: input.modeUsed,
				continue: input.continue,
				continueRationale: input.continueRationale,
			});
			onSubmitReview?.({
				summary: input.summary,
				modeUsed: input.modeUsed,
				continue: input.continue,
				continueRationale: input.continueRationale,
			});
			return ackText({ acknowledged: true, continueNext: input.continue });
		},
	);

	// ─── Vault-scope structured proposals (used by Vault Auto Review) ────

	const proposeClusterObservation = defineCopilotTool(
		'propose_cluster_observation',
		[
			'VAULT-SCOPE ONLY. Publish an observation about one knowledge cluster (a community detected by Louvain).',
			'Use this for cluster-level analysis: growth/decline, centrality, abstraction mix, theme drift.',
			'Each call appears as one row in the Clusters tab and references the cluster by its label.',
			'`representativeNotes` MUST be real .md paths you have evidence for.',
		].join(' '),
		{
			clusterId: z.string().min(1).describe('community_metadata.community_id; copy verbatim from the signal report.'),
			clusterLabel: z.string().min(1).max(120),
			memberCount: z.number().int().nonnegative(),
			status: z.enum(['growing', 'stable', 'dying', 'central', 'fragmenting']),
			headline: z.string().min(4).max(160).describe('One-sentence judgement.'),
			body: z.string().min(10).describe('Markdown body. Cite [[wikilinks]] to evidence notes.'),
			representativeNotes: z.array(z.string()).max(8).default([]),
		},
		async (input) => {
			const inserted = collector.addClusterObservation({
				clusterId: input.clusterId,
				clusterLabel: input.clusterLabel,
				memberCount: input.memberCount,
				status: input.status,
				headline: input.headline,
				body: input.body,
				representativeNotes: input.representativeNotes,
			});
			return ackText({ acknowledged: true, id: inserted.id });
		},
	);

	const proposeGap = defineCopilotTool(
		'propose_gap',
		[
			'VAULT-SCOPE ONLY. Publish a structural gap finding.',
			'Kinds:',
			'  structural-hole       — two clusters share concepts but lack direct links',
			'  dangling-reference    — [[wikilink]] referenced often but no note exists',
			'  stale-hub             — hub node with high incoming links, untouched 6+ months',
			'  abstraction-mismatch  — cluster mixes fleeting and evergreen notes',
			'`references` MUST be real .md paths or `[[Concept]]` tokens copy-pasted from your evidence.',
		].join(' '),
		{
			kind: z.enum(['structural-hole', 'dangling-reference', 'stale-hub', 'abstraction-mismatch']),
			title: z.string().min(4).max(160),
			body: z.string().min(10).describe('Markdown explanation including a candidate bridging action or note name.'),
			confidence: z.enum(['low', 'medium', 'high']).default('medium'),
			references: z.array(z.string()).max(12).default([]),
		},
		async (input) => {
			const inserted = collector.addGap({
				kind: input.kind,
				title: input.title,
				body: input.body,
				confidence: input.confidence,
				references: input.references,
			});
			return ackText({ acknowledged: true, id: inserted.id });
		},
	);

	const proposeAction = defineCopilotTool(
		'propose_action',
		[
			'VAULT-SCOPE ONLY. Publish a concrete recommended action (Phase 1: text-only; Phase 2 will be executable).',
			'Pick a kind that matches the operation; `involvedNotes` MUST list real .md paths the action touches.',
			'`estimatedImpact` is a short user-readable line, e.g. "Connect 7 dangling references" or "Reduce orphan count by 12".',
		].join(' '),
		{
			kind: z.enum([
				'create-note',
				'merge-notes',
				'split-note',
				'archive-cluster',
				'add-tag',
				'restructure',
				'refresh-note',
			]),
			priority: z.enum(['low', 'medium', 'high']).default('medium'),
			title: z.string().min(4).max(160),
			rationale: z.string().min(10).describe('Why this action improves the vault, cite [[wikilinks]] for evidence.'),
			involvedNotes: z.array(z.string()).max(20).default([]),
			estimatedImpact: z.string().max(160).optional(),
		},
		async (input) => {
			const inserted = collector.addAction({
				kind: input.kind,
				priority: input.priority,
				title: input.title,
				rationale: input.rationale,
				involvedNotes: input.involvedNotes,
				estimatedImpact: input.estimatedImpact,
			});
			return ackText({ acknowledged: true, id: inserted.id });
		},
	);

	return [
		proposeInsight,
		proposeChange,
		proposeSource,
		attachChatFollowup,
		noteFinding,
		submitReview,
		proposeClusterObservation,
		proposeGap,
		proposeAction,
	];
}

export const COPILOT_OUTPUT_TOOL_NAMES = [
	'mcp__copilot__propose_insight',
	'mcp__copilot__propose_change',
	'mcp__copilot__propose_source',
	'mcp__copilot__attach_chat_followup',
	'mcp__copilot__note_finding',
	'mcp__copilot__submit_review',
] as const;

export const COPILOT_VAULT_TOOL_NAMES = [
	'mcp__copilot__propose_insight',
	'mcp__copilot__propose_source',
	'mcp__copilot__attach_chat_followup',
	'mcp__copilot__note_finding',
	'mcp__copilot__submit_review',
	'mcp__copilot__propose_cluster_observation',
	'mcp__copilot__propose_gap',
	'mcp__copilot__propose_action',
] as const;
