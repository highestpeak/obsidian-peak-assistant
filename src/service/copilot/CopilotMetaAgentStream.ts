/**
 * Meta-agent stream for Auto Review.
 *
 * Single SDK query per round. Drives a `CopilotOutputCollector` through the
 * propose_* / submit_review toolset. Multi-round coordination lives in
 * `CopilotReviewSession` (see runCopilotReview).
 *
 * 2026-05-17 redesign — replaces planner-driven per-capability agent loops.
 */

import type { LLMStreamEvent } from '@/core/providers/types';
import { StreamTriggerName } from '@/core/providers/types';
import type { Profile } from '@/core/profiles/types';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { warmupPool, queryWithProfile } from '@/service/agents/core/sdkAgentPool';
import { buildVaultMcpServer, type GrepHit } from '@/service/agents/vault-sdk/vaultMcpServer';
import { translateSdkMessage } from '@/service/agents/core/sdkMessageAdapter';

import {
	buildCopilotOutputMcpServer,
	COPILOT_OUTPUT_TOOL_NAMES,
} from './CopilotOutputMcpServer';
import type { CopilotOutputCollector, ReviewSubmission } from './CopilotOutputCollector';
import type { DocumentSignalReport } from './CopilotSignalReport';
import { formatSignalReportForPrompt } from './CopilotSignalReport';

export type ReviewMode = 'fast' | 'complete';

/**
 * User-facing labels for ReviewMode.
 *
 * Internal identifiers ('fast' | 'complete') are stable and tied to the
 * meta-agent / collector / persistence layer; user-visible strings live
 * here so that vocabulary changes don't ripple through call sites.
 *
 * 2026-05-30 — unified with the SurfaceCapability vocabulary:
 *   fast     → "Fast Lookup"   (single-pass, ~8 turns)
 *   complete → "Research"      (multi-round, up to 3 rounds)
 */
export const MODE_LABELS: Record<ReviewMode, string> = {
	fast: 'Fast Lookup',
	complete: 'Research',
};

export interface PreviousRoundSummary {
	roundIndex: number;
	submission: ReviewSubmission;
	insightTitles: string[];
	changeTitles: string[];
	sourcePaths: string[];
	findings: string[];
}

export interface MetaAgentOptions {
	mode: ReviewMode;
	signalReport: DocumentSignalReport;
	/** Full content of the subject note. Pre-loaded into the user prompt so the agent doesn't waste a turn re-reading it. */
	subjectContent: string;
	subjectPath: string;
	previousRounds: PreviousRoundSummary[];
	collector: CopilotOutputCollector;
	maxTurns: number;
	signal?: AbortSignal;
	/** Called once per assistant SDK message — used to drive 70% budget reminder. */
	onTurnIncrement?: () => void;
	/** User profile (built from chat extractor) — injected into system prompt so the agent honours stated preferences. */
	userProfileText?: string;
	/** T11J B2: caller passes app + pluginId so this module no longer reaches AppContext. */
	app: import('@/core/ports/AppHandle').AppHandle;
	pluginId: string;
	/** T11L: narrow port the embedded `get_recent_analysis` tool needs. */
	analysisHistory: import('@/core/ports/AnalysisHistoryPort').AnalysisHistoryPort;
}

const SYSTEM_PROMPT_BASE = `You are the Peak Assistant Auto Review agent.

Your job: inspect the user's current note and publish findings through the
structured propose_* toolset. End with submit_review.

OUTPUT TOOLS:
  - propose_insight   — analytical conclusion (Insights tab).
  - propose_change    — concrete diff with before/after blocks (Changes tab).
  - propose_source    — citation to a vault note (Sources tab).
  - attach_chat_followup — open question worth asking (Insights tab tail).
  - note_finding      — your own short scratch memo (echoed back, not user-facing).
  - submit_review     — call EXACTLY ONCE to end this round.

VAULT TOOLS:
  - vault_list_folders, vault_read_folder, vault_read_note, vault_grep,
    vault_wikilink_expand.

THE SUBJECT NOTE IS ALREADY IN YOUR USER PROMPT — do NOT re-read it.

RULES:
1. Open with a 2-3 line plan in plain text. Then act.
2. **Parallel tool calls**: when you need multiple files, request them in a
   SINGLE turn (the SDK supports parallel tool_use blocks). Do NOT chain
   reads serially when you could batch them.
3. NEVER re-read a path you have already read. Use note_finding if you need
   to remember something across turns.
4. As soon as you have a concrete finding, call propose_insight / propose_change
   / propose_source. Externalise findings via the tools instead of holding
   them in chain-of-thought.
5. You decide how much investigation is enough — submit_review when YOU think
   the review is complete, not by a turn count.

QUALITY:
- Never claim something you did not verify against text you actually read.
- propose_change.before must be an EXACT substring of the subject note (so it
  can be applied). Copy-paste; do not paraphrase.
- **Wikilinks MUST target a real note (.md file), NEVER a folder.**
  - vault_list_folders returns FOLDERS. Folders are NOT valid link targets.
  - vault_read_folder lists notes inside a folder; pick a specific note to link to.
  - If you only have a folder name and no specific note in mind, do NOT invent
    a wikilink — either explore the folder first, or describe the area in plain
    text without a [[link]].
  - propose_source.path must also be an actual note file, not a folder.`;

const FAST_MODE_SUFFIX = `
MODE: fast
- Pick ONE focus area only. Produce a single propose_insight (and at most one
  supporting propose_source). Set submit_review.continue = false.`;

const COMPLETE_MODE_SUFFIX = `
MODE: complete
- Cover every relevant focus area surfaced by the signal report.
- **One identified issue = one propose_change block.** Group blocks by theme
  inside one propose_change; open new propose_change calls for distinct themes.
  If you can name 10 fixable problems, the output should contain 10 blocks
  (spread across however many themed propose_change calls makes sense) — not
  hide 7 of them. Suppressing edits does not improve quality; tight rationales
  on each block do.
- **Pre-submit self-check** (mandatory, before calling submit_review): record
  a note_finding that enumerates every issue you spotted this round, then for
  each item write whether it is covered by an existing propose_change block.
  If any item is NOT covered, EITHER add a block now OR set
  submit_review.continue = true with a continueRationale naming what's left.
- Do not submit with fewer blocks than identified issues unless you explicitly
  acknowledge the omitted ones in the summary and request a continue round.
- You decide when the review is done. There is no turn or round cap.`;

/**
 * Pick the LLM profile + optional model override for a given review mode.
 *
 * - Fast mode prefers (in order): the dedicated activeAgentFastConfig role
 *   (use its profile + its modelId), or the active agent profile with its
 *   `fastModel` field used as a modelOverride. Either path means Fast runs on
 *   Haiku (or whatever the user designated as fast) while Auto stays on the
 *   heavier primary model.
 * - Complete mode always uses the active agent profile with no override.
 */
function resolveProfileForMode(mode: ReviewMode): { profile: Profile; modelOverride?: string } | null {
	const registry = ProfileRegistry.getInstance();
	const agentProfile = registry.getActiveAgentProfile();
	if (!agentProfile) return null;
	if (mode !== 'fast') return { profile: agentProfile };

	const fastConfig = registry.getActiveAgentFastConfig();
	if (fastConfig?.profile && fastConfig.modelId) {
		return { profile: fastConfig.profile, modelOverride: fastConfig.modelId };
	}
	if (agentProfile.fastModel && agentProfile.fastModel !== agentProfile.primaryModel) {
		return { profile: agentProfile, modelOverride: agentProfile.fastModel };
	}
	return { profile: agentProfile };
}

function buildPreviousRoundsBlock(prev: PreviousRoundSummary[]): string {
	if (prev.length === 0) return '';
	const parts: string[] = ['', '<previous-rounds>'];
	for (const r of prev) {
		parts.push(`Round ${r.roundIndex + 1} summary: ${r.submission.summary}`);
		if (r.submission.continue && r.submission.continueRationale) {
			parts.push(`Round ${r.roundIndex + 1} requested next angle: ${r.submission.continueRationale}`);
		}
		if (r.insightTitles.length > 0) {
			parts.push(`Already produced insights: ${r.insightTitles.join('; ')}`);
		}
		if (r.changeTitles.length > 0) {
			parts.push(`Already produced changes: ${r.changeTitles.join('; ')}`);
		}
		if (r.sourcePaths.length > 0) {
			parts.push(`Cited sources: ${r.sourcePaths.join(', ')}`);
		}
	}
	const allFindings = prev.flatMap(r => r.findings);
	if (allFindings.length > 0) {
		const joined = allFindings.join(' · ').slice(0, 4000);
		parts.push(`Findings so far: ${joined}`);
	}
	parts.push('</previous-rounds>');
	parts.push(`This is round ${prev.length + 1}. Explore an angle not yet covered, or set submit_review.continue=false to end the review.`);
	return parts.join('\n');
}

function buildLanguageGuidance(language: DocumentSignalReport['language']): string {
	if (language === 'zh') {
		return [
			'LANGUAGE: 当前笔记的主要语言是中文。',
			'- propose_insight.title / body、propose_change.title / heading / rationale、attach_chat_followup.question 全部用中文撰写。',
			'- propose_change.before / after 必须忠实使用原文（包括其中的英文术语、代码、专有名词）。',
			'- submit_review.summary 用中文。',
			'- note_finding 自己看的备忘，语言不限。',
		].join('\n');
	}
	if (language === 'en') {
		return [
			'LANGUAGE: the subject note is in English.',
			'- All user-facing fields (insight body, change rationale, follow-up question, summary) MUST be in English.',
			'- propose_change.before/after must reproduce the original text exactly, regardless of language.',
		].join('\n');
	}
	return [
		'LANGUAGE: the subject note mixes languages. Match the language of the surrounding section when writing insight bodies and rationales.',
		'- propose_change.before/after must reproduce the original text exactly.',
	].join('\n');
}

function buildUserPreferencesBlock(profileText: string | undefined): string {
	const trimmed = profileText?.trim();
	if (!trimmed) return '';
	const slice = trimmed.length > 2000 ? `${trimmed.slice(0, 2000)}\n...(truncated)` : trimmed;
	return [
		'',
		'USER PREFERENCES (from the user\'s long-term profile — honour these when they conflict with generic defaults):',
		'<user-profile>',
		slice,
		'</user-profile>',
	].join('\n');
}

export function buildMetaAgentSystemPrompt(options: {
	mode: ReviewMode;
	signalReport: DocumentSignalReport;
	previousRounds: PreviousRoundSummary[];
	userProfileText?: string;
}): string {
	const modeSuffix = options.mode === 'fast' ? FAST_MODE_SUFFIX : COMPLETE_MODE_SUFFIX;
	const signal = formatSignalReportForPrompt(options.signalReport);
	const prevBlock = buildPreviousRoundsBlock(options.previousRounds);
	const languageBlock = buildLanguageGuidance(options.signalReport.language);
	const preferencesBlock = buildUserPreferencesBlock(options.userProfileText);
	return [
		SYSTEM_PROMPT_BASE,
		'',
		'SIGNAL REPORT (pre-flight, not from an agent — these are factual stats):',
		signal,
		'',
		languageBlock,
		preferencesBlock,
		modeSuffix,
		prevBlock,
	].filter(Boolean).join('\n');
}

/** Cap how much of the subject content we paste into the user prompt directly. */
const SUBJECT_PASTE_CHAR_CAP = 12000;

export function buildMetaAgentUserPrompt(params: {
	signalReport: DocumentSignalReport;
	subjectContent: string;
	subjectPath: string;
}): string {
	const { subjectContent, subjectPath, signalReport } = params;
	const truncated = subjectContent.length > SUBJECT_PASTE_CHAR_CAP;
	const slice = truncated
		? subjectContent.slice(0, SUBJECT_PASTE_CHAR_CAP)
		: subjectContent;
	const truncationNote = truncated
		? `\n\n[Note truncated at ${SUBJECT_PASTE_CHAR_CAP} chars; original is ${subjectContent.length} chars. Use vault_read_note with a larger maxChars if you need the tail.]`
		: '';
	return [
		`Review "${signalReport.basename}" now. Begin with your 2-3 line plan.`,
		'',
		`<subject-note path="${subjectPath}">`,
		slice + truncationNote,
		'</subject-note>',
	].join('\n');
}

/**
 * One round of the meta-agent. Yields LLMStreamEvents for trace display.
 * Returns when the SDK stream completes (either via submit_review, maxTurns,
 * or signal abort).
 *
 * Multi-round orchestration is handled by `runCopilotReview` (separate function).
 */
export async function* buildCopilotMetaAgentStream(
	options: MetaAgentOptions,
): AsyncGenerator<LLMStreamEvent, void> {
	const triggerName = StreamTriggerName.COPILOT;
	const { app, pluginId } = options;

	try {
		await warmupPool();
	} catch (err) {
		yield { type: 'error', error: err as Error, triggerName } as LLMStreamEvent;
		return;
	}

	const resolved = resolveProfileForMode(options.mode);
	if (!resolved) {
		yield {
			type: 'error',
			error: new Error('No active agent profile configured. Please set up a profile in Settings.'),
			triggerName,
		} as LLMStreamEvent;
		return;
	}
	const { profile, modelOverride } = resolved;

	const searchClient = appContext.searchClient;
	const searchFn = async (q: string, limit: number): Promise<GrepHit[]> => {
		const res = await searchClient.search({
			text: q,
			topK: limit,
			searchMode: 'hybrid',
			scopeMode: 'vault',
			indexTenant: 'vault',
		} as unknown as Parameters<typeof searchClient.search>[0]);
		return (res.items ?? []).map((i: { path: string; title?: string; score?: number }) => ({
			path: i.path,
			snippet: i.title ?? i.path,
			score: i.score ?? 0,
		}));
	};

	const vaultMcpServer = buildVaultMcpServer({
		app,
		searchFn,
		onSubmitPlan: async (plan) => ({
			approved: true,
			adjustedPaths: plan.selected_paths,
			adjustedOutline: plan.proposed_outline,
		}),
		analysisHistory: options.analysisHistory,
	});

	const copilotMcpServer = buildCopilotOutputMcpServer({
		collector: options.collector,
	});

	const systemPrompt = buildMetaAgentSystemPrompt({
		mode: options.mode,
		signalReport: options.signalReport,
		previousRounds: options.previousRounds,
		userProfileText: options.userProfileText,
	});
	const userPrompt = buildMetaAgentUserPrompt({
		signalReport: options.signalReport,
		subjectContent: options.subjectContent,
		subjectPath: options.subjectPath,
	});

	try {
		const allowedTools = [
			'mcp__vault__vault_list_folders',
			'mcp__vault__vault_read_folder',
			'mcp__vault__vault_read_note',
			'mcp__vault__vault_grep',
			'mcp__vault__vault_wikilink_expand',
			...COPILOT_OUTPUT_TOOL_NAMES,
		];

		const messages = queryWithProfile(app, pluginId, profile, {
			prompt: userPrompt,
			systemPrompt,
			maxTurns: options.maxTurns,
			allowedTools,
			disallowedTools: ['AskUserQuestion', 'mcp__vault__vault_submit_plan'],
			mcpServers: {
				vault: vaultMcpServer,
				copilot: copilotMcpServer,
			},
			signal: options.signal,
			usageFeature: 'copilot',
			usageAction: `auto-review-round-${options.previousRounds.length}`,
			modelOverride,
		});

		for await (const raw of messages) {
			if (options.signal?.aborted) return;
			const msgType = (raw as { type?: string }).type;
			if (msgType === 'assistant') {
				options.onTurnIncrement?.();
			}
			const events = translateSdkMessage(raw, {
				triggerName,
				hasPartialMessages: true,
			});
			for (const ev of events) {
				yield ev;
			}
		}
	} catch (err) {
		const msg = (err as Error)?.message ?? '';
		if (msg.toLowerCase().includes('maximum number of turns')) {
			console.warn('[CopilotMetaAgent] max turns reached this round');
			yield { type: 'pk-debug', debugName: 'max-turns-reached', triggerName } as LLMStreamEvent;
			return;
		}
		yield { type: 'error', error: err as Error, triggerName } as LLMStreamEvent;
	}

	yield {
		type: 'complete',
		triggerName,
		durationMs: 0,
	} as LLMStreamEvent;
}
