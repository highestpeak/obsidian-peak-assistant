/**
 * Meta-agent stream for Auto Review.
 *
 * Single Peak Harness run per round. Drives a `CopilotOutputCollector` through the
 * propose_* / submit_review toolset. Multi-round coordination lives in
 * `CopilotReviewSession` (see runCopilotReview).
 *
 * 2026-05-17 redesign — replaces planner-driven per-capability agent loops.
 */

import type { LLMStreamEvent } from '@/core/providers/types';
import { StreamTriggerName } from '@/core/providers/types';
import type { Profile } from '@/core/profiles/types';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { PromptId } from '@/core/types/prompt';
import { TemplateManager } from '@/core/template/TemplateManager';
import type { GrepHit } from '@/service/agents/vault/vaultToolImplementations';
import {
	assertSuccessfulRun,
	streamHarnessModel,
} from '@/service/agents/harness/HarnessModelRunner';
import { buildVaultHarnessTools } from '@/service/agents/vault/vaultHarnessTools';
import type { PluginCommandGatewayPort } from '@/core/ports/PluginCommandGatewayPort';
import { loadApprovedPluginCommandTools } from '@/service/command-gateway/pluginCommandToolCatalog';

import {
	buildCopilotOutputTools,
	COPILOT_OUTPUT_TOOL_NAMES,
} from './CopilotOutputTools';
import type { CopilotOutputCollector, ReviewSubmission } from './CopilotOutputCollector';
import type { DocumentSignalReport } from './CopilotSignalReport';
import { formatSignalReportForPrompt } from './CopilotSignalReport';
import type { DebugTracePort } from '@/core/debug-trace';

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
	/** Called once per Harness model step — used to drive 70% budget reminder. */
	onTurnIncrement?: () => void;
	/** User profile (built from chat extractor) — injected into system prompt so the agent honours stated preferences. */
	userProfileText?: string;
	/** T11J B2: caller passes app + pluginId so this module no longer reaches AppContext. */
	app: import('@/core/ports/AppHandle').AppHandle;
	pluginId: string;
	/** T11L: narrow port the embedded `get_recent_analysis` tool needs. */
	analysisHistory: import('@/core/ports/AnalysisHistoryPort').AnalysisHistoryPort;
	/** Search client for grep_vault helper — injected by caller so this module never reaches AppContext. */
	searchClient: import('@/service/search/SearchClient').SearchClient;
	/** Current app-owned allowlist of external plugin commands. */
	pluginCommandGateway?: PluginCommandGatewayPort | null;
	debugTrace?: DebugTracePort | null;
}

/**
 * T11Y-6: SYSTEM_PROMPT_BASE / FAST_MODE_SUFFIX / COMPLETE_MODE_SUFFIX moved to
 * templates/prompts/copilot-meta-agent-{system-base,fast-mode-suffix,complete-mode-suffix}.md
 * — see PromptId.CopilotMetaAgent{SystemBase,FastModeSuffix,CompleteModeSuffix}.
 *
 * The two suffix templates start with "MODE: ..." but the original constants
 * started with a leading newline so that joining them with the rest of the
 * prompt added a blank line before "MODE:". We prepend that "\n" back in the
 * caller to preserve byte-equality with pre-migration output.
 */

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
function resolveProfileForMode(mode: ReviewMode): { profile: Profile; modelId: string } | null {
	const registry = ProfileRegistry.getInstance();
	const agentConfig = registry.getActiveAgentConfig();
	if (!agentConfig) return null;
	if (mode !== 'fast') return agentConfig;

	const fastConfig = registry.getActiveAgentFastConfig();
	if (fastConfig?.profile && fastConfig.modelId) {
		return { profile: fastConfig.profile, modelId: fastConfig.modelId };
	}
	const agentProfile = agentConfig.profile;
	if (agentProfile.fastModel && agentProfile.fastModel !== agentProfile.primaryModel) {
		return { profile: agentProfile, modelId: agentProfile.fastModel };
	}
	return agentConfig;
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

export async function buildMetaAgentSystemPrompt(options: {
	mode: ReviewMode;
	signalReport: DocumentSignalReport;
	previousRounds: PreviousRoundSummary[];
	userProfileText?: string;
}): Promise<string> {
	const tm = TemplateManager.getInstance();
	if (!tm) throw new Error('TemplateManager not bound — cannot render copilot meta-agent prompts.');
	const base = await tm.render(PromptId.CopilotMetaAgentSystemBase, {});
	const suffixBody = options.mode === 'fast'
		? await tm.render(PromptId.CopilotMetaAgentFastModeSuffix, {})
		: await tm.render(PromptId.CopilotMetaAgentCompleteModeSuffix, {});
	const modeSuffix = '\n' + suffixBody;
	const signal = formatSignalReportForPrompt(options.signalReport);
	const prevBlock = buildPreviousRoundsBlock(options.previousRounds);
	const languageBlock = buildLanguageGuidance(options.signalReport.language);
	const preferencesBlock = buildUserPreferencesBlock(options.userProfileText);
	return [
		base,
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
 * Returns when the Harness run completes (either via submit_review, maxTurns,
 * or signal abort).
 *
 * Multi-round orchestration is handled by `runCopilotReview` (separate function).
 */
export async function* buildCopilotMetaAgentStream(
	options: MetaAgentOptions,
): AsyncGenerator<LLMStreamEvent, void> {
	const triggerName = StreamTriggerName.COPILOT;
	const { app, pluginId } = options;

	const resolved = resolveProfileForMode(options.mode);
	if (!resolved) {
		yield {
			type: 'error',
			error: new Error('No active agent profile configured. Please set up a profile in Settings.'),
			triggerName,
		} as LLMStreamEvent;
		return;
	}
	const { profile, modelId } = resolved;

	const searchClient = options.searchClient;
	const searchFn = async (q: string, limit: number): Promise<GrepHit[]> => {
		const res = await searchClient.search({
			text: q,
			topK: limit,
			searchMode: 'hybrid',
			scopeMode: 'all',
			indexTenant: 'vault',
		} as unknown as Parameters<typeof searchClient.search>[0]);
		return (res.items ?? []).map((i: { path: string; title?: string; score?: number }) => ({
			path: i.path,
			snippet: i.title ?? i.path,
			score: i.score ?? 0,
		}));
	};

	const vaultTools = buildVaultHarnessTools({
		app,
		searchFn,
		onSubmitPlan: async (plan) => ({
			approved: true,
			adjustedPaths: plan.selected_paths,
			adjustedOutline: plan.proposed_outline,
		}),
		analysisHistory: options.analysisHistory,
	});

	const copilotTools = buildCopilotOutputTools({
		collector: options.collector,
	});
	const pluginCommandTools = await loadApprovedPluginCommandTools(
		options.pluginCommandGateway,
	);

	const systemPrompt = await buildMetaAgentSystemPrompt({
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
			...pluginCommandTools.map((tool) => tool.name),
		];

		const allowedToolNames = new Set(allowedTools);
		const tools = [...vaultTools, ...copilotTools, ...pluginCommandTools]
			.filter((tool) => allowedToolNames.has(tool.name));
		const submissionsBefore = options.collector.getSnapshot().submissions.length;
		const stream = streamHarnessModel({
			loopId: `copilot-review-${pluginId}-${options.previousRounds.length + 1}`,
			profile,
			modelId,
			prompt: userPrompt,
			systemPrompt,
			tools,
			maxSteps: options.maxTurns,
			maxToolCalls: Math.max(12, options.maxTurns * 4),
			signal: options.signal,
			triggerName,
			debugTrace: options.debugTrace,
			debugSurface: 'analyze',
			debugCapabilityId: 'copilot.document-review',
			stopWhen: () =>
				options.collector.getSnapshot().submissions.length > submissionsBefore,
			treatBareTextAsFinal: false,
			bareTextContinuationNudge: 'Continue the review using the available tools. Finish by calling mcp__copilot__submit_review.',
			onStepFinish: () => {
				options.onTurnIncrement?.();
			},
		});

		while (true) {
			const next = await stream.next();
			if (next.done) {
				if (next.value.finishReason === 'max_steps') {
					console.warn('[CopilotMetaAgent] max steps reached this round');
					yield { type: 'pk-debug', debugName: 'max-turns-reached', triggerName } as LLMStreamEvent;
				}
				assertSuccessfulRun(next.value);
				break;
			}
			yield next.value;
		}
	} catch (err) {
		yield { type: 'error', error: err as Error, triggerName } as LLMStreamEvent;
	}
}
