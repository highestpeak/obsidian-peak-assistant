/**
 * Vault-scope meta-agent stream.
 *
 * Sister to `CopilotMetaAgentStream` (doc scope). Differences:
 *   - Subject is the entire vault, no ctx.file
 *   - Pre-flight = VaultDigest (counts, clusters, holes, hubs, lint health)
 *   - Tools: propose_insight / propose_cluster_observation / propose_gap /
 *            propose_action / propose_source / note_finding / submit_review
 *            (no propose_change — vault layer does not produce doc diffs)
 *   - System prompt encourages cluster references and global judgement
 *
 * Multi-round orchestration is identical and lives in `VaultReviewSession`.
 */

import type { AppHandle } from '@/core/ports/AppHandle';
import type { AnalysisHistoryPort } from '@/core/ports/AnalysisHistoryPort';
import type { LLMStreamEvent } from '@/core/providers/types';
import { StreamTriggerName } from '@/core/providers/types';
import type { Profile } from '@/core/profiles/types';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { PromptId } from '@/core/types/prompt';
import { TemplateManager } from '@/core/template/TemplateManager';
import type { SearchClient } from '@/service/search/SearchClient';
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
	COPILOT_VAULT_TOOL_NAMES,
} from '../CopilotOutputTools';
import type { CopilotOutputCollector, ReviewSubmission } from '../CopilotOutputCollector';
import type { VaultDigest } from './VaultDigestService';
import { formatVaultDigestForPrompt } from './VaultDigestService';

export type VaultReviewMode = 'fast' | 'complete';

export interface VaultPreviousRoundSummary {
	roundIndex: number;
	submission: ReviewSubmission;
	clusterLabels: string[];
	gapTitles: string[];
	actionTitles: string[];
	findings: string[];
}

export interface VaultMetaAgentOptions {
	mode: VaultReviewMode;
	digest: VaultDigest;
	previousRounds: VaultPreviousRoundSummary[];
	collector: CopilotOutputCollector;
	maxTurns: number;
	signal?: AbortSignal;
	onTurnIncrement?: () => void;
	userProfileText?: string;
}

/**
 * T11Y-6: SYSTEM_PROMPT_BASE / FAST_MODE_SUFFIX / COMPLETE_MODE_SUFFIX moved to
 * templates/prompts/vault-meta-agent-{system-base,fast-mode-suffix,complete-mode-suffix}.md
 * — see PromptId.VaultMetaAgent{SystemBase,FastModeSuffix,CompleteModeSuffix}.
 *
 * The suffix templates begin with "MODE: ..." but the original constants
 * started with a leading newline. We prepend that "\n" back when assembling
 * to preserve byte-equality with pre-migration output.
 */

function resolveProfileForMode(mode: VaultReviewMode): { profile: Profile; modelId: string } | null {
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

function buildPreviousRoundsBlock(prev: VaultPreviousRoundSummary[]): string {
	if (prev.length === 0) return '';
	const parts: string[] = ['', '<previous-rounds>'];
	for (const r of prev) {
		parts.push(`Round ${r.roundIndex + 1} summary: ${r.submission.summary}`);
		if (r.submission.continue && r.submission.continueRationale) {
			parts.push(`Round ${r.roundIndex + 1} requested next angle: ${r.submission.continueRationale}`);
		}
		if (r.clusterLabels.length > 0) parts.push(`Already covered clusters: ${r.clusterLabels.join('; ')}`);
		if (r.gapTitles.length > 0) parts.push(`Already produced gaps: ${r.gapTitles.join('; ')}`);
		if (r.actionTitles.length > 0) parts.push(`Already produced actions: ${r.actionTitles.join('; ')}`);
	}
	const allFindings = prev.flatMap(r => r.findings);
	if (allFindings.length > 0) {
		const joined = allFindings.join(' · ').slice(0, 4000);
		parts.push(`Findings so far: ${joined}`);
	}
	parts.push('</previous-rounds>');
	parts.push(`This is round ${prev.length + 1}. Cover an angle not yet covered, or set submit_review.continue=false.`);
	return parts.join('\n');
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

export async function buildVaultMetaAgentSystemPrompt(options: {
	mode: VaultReviewMode;
	digest: VaultDigest;
	previousRounds: VaultPreviousRoundSummary[];
	userProfileText?: string;
}): Promise<string> {
	const tm = TemplateManager.getInstance();
	if (!tm) throw new Error('TemplateManager not bound — cannot render vault meta-agent prompts.');
	const base = await tm.render(PromptId.VaultMetaAgentSystemBase, {});
	const suffixBody = options.mode === 'fast'
		? await tm.render(PromptId.VaultMetaAgentFastModeSuffix, {})
		: await tm.render(PromptId.VaultMetaAgentCompleteModeSuffix, {});
	const modeSuffix = '\n' + suffixBody;
	const digestText = formatVaultDigestForPrompt(options.digest);
	const prevBlock = buildPreviousRoundsBlock(options.previousRounds);
	const prefs = buildUserPreferencesBlock(options.userProfileText);
	return [
		base,
		'',
		'VAULT DIGEST (pre-flight, computed from index + lint + community detection):',
		digestText,
		prefs,
		modeSuffix,
		prevBlock,
	].filter(Boolean).join('\n');
}

export function buildVaultMetaAgentUserPrompt(digest: VaultDigest): string {
	return [
		`Review the entire vault now. Begin with your 2-3 line plan.`,
		``,
		`The digest fingerprint is ${digest.fingerprint.fingerprint.slice(0, 12)}… covering ${digest.counts.notes} notes (${digest.counts.words.toLocaleString()} words).`,
	].join('\n');
}

/**
 * Concrete Obsidian / app-shell deps the vault meta-agent needs. Pre-T9
 * this came from `AppContext.getInstance()`; T9 routes it through an
 * explicit param so this service file no longer reaches the app
 * shell. The composition (`composeVaultReviewRuntime`) supplies these
 * via `AppVaultReviewAgentAdapter`.
 */
export interface VaultMetaAgentRunDeps {
	app: AppHandle;
	pluginId: string;
	searchClient: SearchClient;
	/** T11L: narrow port the vault MCP server passes to `get_recent_analysis`. */
	analysisHistory: AnalysisHistoryPort;
	/** Current app-owned allowlist of external plugin commands. */
	pluginCommandGateway?: PluginCommandGatewayPort | null;
}

export async function* buildVaultMetaAgentStream(
	deps: VaultMetaAgentRunDeps,
	options: VaultMetaAgentOptions,
): AsyncGenerator<LLMStreamEvent> {
	const triggerName = StreamTriggerName.COPILOT;
	const { app, pluginId } = deps;

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

	const { searchClient } = deps;
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
		analysisHistory: deps.analysisHistory,
	});

	const copilotTools = buildCopilotOutputTools({
		collector: options.collector,
	});
	const pluginCommandTools = await loadApprovedPluginCommandTools(
		deps.pluginCommandGateway,
	);

	const systemPrompt = await buildVaultMetaAgentSystemPrompt({
		mode: options.mode,
		digest: options.digest,
		previousRounds: options.previousRounds,
		userProfileText: options.userProfileText,
	});
	const userPrompt = buildVaultMetaAgentUserPrompt(options.digest);

	try {
		const allowedTools = [
			'mcp__vault__vault_list_folders',
			'mcp__vault__vault_read_folder',
			'mcp__vault__vault_read_note',
			'mcp__vault__vault_grep',
			'mcp__vault__vault_wikilink_expand',
			...COPILOT_VAULT_TOOL_NAMES,
			...pluginCommandTools.map((tool) => tool.name),
		];

		const allowedToolNames = new Set(allowedTools);
		const tools = [...vaultTools, ...copilotTools, ...pluginCommandTools]
			.filter((tool) => allowedToolNames.has(tool.name));
		const submissionsBefore = options.collector.getSnapshot().submissions.length;
		const stream = streamHarnessModel({
			loopId: `vault-review-${pluginId}-${options.previousRounds.length + 1}`,
			profile,
			modelId,
			prompt: userPrompt,
			systemPrompt,
			tools,
			maxSteps: options.maxTurns,
			maxToolCalls: Math.max(12, options.maxTurns * 4),
			signal: options.signal,
			triggerName,
			stopWhen: () =>
				options.collector.getSnapshot().submissions.length > submissionsBefore,
			treatBareTextAsFinal: false,
			bareTextContinuationNudge: 'Continue the vault review using the available tools. Finish by calling mcp__copilot__submit_review.',
			onStepFinish: () => {
				options.onTurnIncrement?.();
			},
		});

		while (true) {
			const next = await stream.next();
			if (next.done) {
				if (next.value.finishReason === 'max_steps') {
					console.warn('[VaultMetaAgent] max steps reached this round');
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
