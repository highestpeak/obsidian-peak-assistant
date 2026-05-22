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

import type { LLMStreamEvent } from '@/core/providers/types';
import { StreamTriggerName } from '@/core/providers/types';
import type { Profile } from '@/core/profiles/types';
import { AppContext } from '@/app/context/AppContext';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { warmupPool, queryWithProfile } from '@/service/agents/core/sdkAgentPool';
import { buildVaultMcpServer, type GrepHit } from '@/service/agents/vault-sdk/vaultMcpServer';
import { translateSdkMessage } from '@/service/agents/core/sdkMessageAdapter';

import {
	buildCopilotOutputMcpServer,
	COPILOT_VAULT_TOOL_NAMES,
} from '../CopilotOutputMcpServer';
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

const SYSTEM_PROMPT_BASE = `You are the Peak Assistant Vault Review agent.

Your job: produce a vault-level health diagnosis from the pre-computed signal
digest. The subject is the ENTIRE knowledge base, not any single note.

OUTPUT TOOLS (vault scope):
  - propose_insight              — general analytical conclusion (Overview/Insights tab).
  - propose_cluster_observation  — per-cluster judgement (growing / dying / central / fragmenting / abstraction-mix).
  - propose_gap                  — structural-hole / dangling-reference / stale-hub / abstraction-mismatch.
  - propose_action               — concrete recommendation (create / merge / split / archive / add-tag / restructure / refresh).
  - propose_source               — cite a vault note that justified your call.
  - attach_chat_followup         — open question worth surfacing.
  - note_finding                 — short scratch memo (echoed back, not user-facing).
  - submit_review                — call EXACTLY ONCE to end this round.

VAULT TOOLS:
  - vault_list_folders, vault_read_folder, vault_read_note, vault_grep,
    vault_wikilink_expand.

THE VAULT DIGEST IS ALREADY IN YOUR USER PROMPT — start with it, then read
specific notes only when you need to verify a judgement.

RULES:
1. Open with a 2-3 line plan in plain text. Then act.
2. **Parallel tool calls**: when you need multiple files, request them in a
   SINGLE turn (the SDK supports parallel tool_use blocks).
3. NEVER re-read a path you have already read. Use note_finding if you need
   to remember something across turns.
4. Externalise every concrete judgement through propose_* immediately. Do not
   hold findings in chain-of-thought.
5. You decide how much investigation is enough — submit_review when YOU think
   the review is complete, not by a turn count.

QUALITY:
- Never claim something you did not verify against the digest OR a note you
  actually read.
- **Always reference real notes by [[wikilink]] inside body/rationale.** Generic
  vague statements ("the vault has some gaps") are forbidden.
- Wikilinks MUST target a real note (.md file). Folders are NOT valid link targets.
- **propose_cluster_observation.clusterLabel MUST be a semantic name** derived
  from the cluster's dominant_topics or top_nodes (e.g. "AI Engineering",
  "Search Architecture"). NEVER use the raw "Community 7" id as the label —
  invent a 1-3 word topic name based on the actual content. Keep clusterId as
  the verbatim id from the digest, but clusterLabel is your synthesis.
- propose_gap.references MUST be real .md paths or [[Concept]] tokens that
  actually appear in the digest or in notes you read.
- propose_action.involvedNotes MUST be real .md paths.
- DO NOT propose changes to the vault-review-*.md files themselves; they have
  frontmatter type: peak-vault-review.

COVERAGE TARGETS (mandatory in complete mode):
- propose_cluster_observation: at least one for every cluster listed in the
  digest (up to the top 12). Even "stable" clusters deserve a one-sentence
  observation. Skip only if the cluster is empty / noise.
- propose_gap: aim for 5-10 across all 4 kinds. Cover every structural hole
  with gapScore >= 0.4 in the digest. Surface dangling references that are
  cited 3+ times. Flag every stale hub mentioned in the digest.
- propose_action: aim for 5-8, mixing high / medium / low priorities. Use the
  full kind vocabulary (create-note / merge-notes / split-note /
  archive-cluster / add-tag / restructure / refresh-note) where applicable.
- propose_source: cite 10-20 background notes. Source != evidence ONLY for
  one cluster — distribute citations across the insights you produced.`;

const FAST_MODE_SUFFIX = `
MODE: fast
- Single round. Produce 2-4 high-signal propose_* calls and stop.
- Prioritise: 1 insight, 1-2 cluster observations on the most active or most
  dying cluster, 1 gap, 1 action.
- Set submit_review.continue = false.`;

const COMPLETE_MODE_SUFFIX = `
MODE: complete
- Multi-round allowed. Cover all clusters in the digest plus the top
  structural holes and the most impactful gaps.
- Each cluster from the digest that materially changed in the last 30 days
  deserves at least one propose_cluster_observation.
- Each structural hole with gapScore ≥ 0.4 deserves a propose_gap (or a
  reasoned dismissal in submit_review.summary).
- One identified issue = one propose_*. If you spot 10 problems, produce 10
  proposals; do not collapse them into vague single insights.
- **Pre-submit self-check** (mandatory): record a note_finding that lists
  every issue you identified, then verify each has a corresponding propose_*.
  If anything is missing, add it OR set continue=true with a continueRationale.
- Submit_review.summary should capture the 1-2 headline judgements of the
  review (this becomes the report headline).
- You decide when the review is done.`;

function resolveProfileForMode(mode: VaultReviewMode): { profile: Profile; modelOverride?: string } | null {
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

export function buildVaultMetaAgentSystemPrompt(options: {
	mode: VaultReviewMode;
	digest: VaultDigest;
	previousRounds: VaultPreviousRoundSummary[];
	userProfileText?: string;
}): string {
	const modeSuffix = options.mode === 'fast' ? FAST_MODE_SUFFIX : COMPLETE_MODE_SUFFIX;
	const digestText = formatVaultDigestForPrompt(options.digest);
	const prevBlock = buildPreviousRoundsBlock(options.previousRounds);
	const prefs = buildUserPreferencesBlock(options.userProfileText);
	return [
		SYSTEM_PROMPT_BASE,
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

export async function* buildVaultMetaAgentStream(options: VaultMetaAgentOptions): AsyncGenerator<LLMStreamEvent> {
	const triggerName = StreamTriggerName.COPILOT;
	const appContext = AppContext.getInstance();
	const app = appContext.app;
	const pluginId = appContext.plugin.manifest.id;

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
	});

	const copilotMcpServer = buildCopilotOutputMcpServer({
		collector: options.collector,
	});

	const systemPrompt = buildVaultMetaAgentSystemPrompt({
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
		];

		const messages = queryWithProfile(app, pluginId, profile, {
			prompt: userPrompt,
			systemPrompt,
			maxTurns: options.maxTurns,
			allowedTools,
			disallowedTools: ['AskUserQuestion', 'mcp__vault__vault_submit_plan', 'mcp__copilot__propose_change'],
			mcpServers: {
				vault: vaultMcpServer,
				copilot: copilotMcpServer,
			},
			signal: options.signal,
			usageFeature: 'copilot',
			usageAction: `vault-review-round-${options.previousRounds.length}`,
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
			console.warn('[VaultMetaAgent] max turns reached this round');
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
