/**
 * Folder-hub recon: plan step (optional tools, host executes) → structured submit (no tools).
 */

import { streamText } from 'ai';
import type { ModelMessage } from 'ai';
import { hubDiscoveryFolderReconSubmitSchema, type RejectedFolderPathEntry } from '@/core/schemas';
import { isBlankString } from '@/core/utils/common-utils';
import { buildPromptTraceDebugEvent, streamTransform } from '@/core/providers/helpers/stream-helper';
import { StreamTriggerName, UIStepType, type LLMStreamEvent } from '@/core/providers/types';
import { Stopwatch } from '@/core/utils/Stopwatch';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { PromptId } from '@/service/prompt/PromptId';
import {
	buildInitialFolderReconMemory,
} from './hubDiscovery.memory';
import { buildFolderHubTools, executeReconToolCalls } from './hubDiscovery.tools';
import { effectiveReconMaxIterations, type ReconLoopDebugOptions } from './hubDiscoveryDebug';
import type {
	FolderHubCandidate,
	FolderNavigationGroup,
	FolderReconMemory,
	FolderTreeNodeDigest,
	HighwayFolderLead,
	HubDiscoveryPrepContext,
} from './types';

/** Compact table of top folders by doc count / degrees for the first recon plan message. */
export function buildFolderDigestMarkdown(nodes: FolderTreeNodeDigest[], maxLines: number): string {
	const sorted = [...nodes].sort((a, b) => b.docCount - a.docCount || b.docOutgoing - a.docOutgoing);
	const lines = sorted.slice(0, maxLines).map((n) => {
		const iaTags = n.topTopics.slice(0, 6).join(', ') || '—';
		const keywords = n.topKeywords.slice(0, 6).join(', ') || '—';
		const avgD = n.subtreeAvgDepth.toFixed(1);
		const fileTok = n.fileNameTokenSample.length ? n.fileNameTokenSample.join(', ') : '—';
		const subTok =
			n.childFolderCount > 0 ? (n.subfolderNameTokenSample.length ? n.subfolderNameTokenSample.join(', ') : '—') : '—';
		const safe = (s: string) => s.replace(/\|/g, ' ');
		return `| \`${n.path}\` | ${n.docCount} | in ${n.docIncoming} / out ${n.docOutgoing} | ${n.childFolderCount} | ${n.subtreeMaxDepth} | ${avgD} | ${iaTags} | ${keywords} | ${safe(fileTok)} | ${safe(subTok)} |`;
	});
	return [
		'| Path | Docs | Degrees (in/out) | Subdirs | Max depth | Avg depth | IA tags | Keywords | File name tokens | Subfolder name tokens |',
		'| --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- |',
		...lines,
	].join('\n');
}

/** Compact table that spotlights deeper thematic candidates so plan doesn't stop at broad shallow folders. */
export function buildDeepFolderDigestMarkdown(nodes: FolderTreeNodeDigest[], maxLines: number): string {
	const scored = nodes
		.filter((n) => n.depth >= 3)
		.map((n) => ({
			node: n,
			score:
				n.docCount * 1.25
				+ n.docOutgoing * 0.12
				+ Math.max(0, n.depth - 2) * 14
				+ Math.max(0, n.childFolderCount - 1) * 5,
		}))
		.sort((a, b) => b.score - a.score || b.node.docCount - a.node.docCount || b.node.docOutgoing - a.node.docOutgoing);
	const lines = scored.slice(0, maxLines).map(({ node: n }) => {
		const keywords = n.topKeywords.slice(0, 6).join(', ') || '—';
		const topics = n.topTopics.slice(0, 4).join(', ') || '—';
		return `| \`${n.path}\` | ${n.depth} | ${n.docCount} | ${n.childFolderCount} | ${n.docOutgoing} | ${keywords} | ${topics} |`;
	});
	if (lines.length === 0) return '_(No depth >= 3 folder candidates found in snapshot.)_';
	return [
		'| Path | Depth | Docs | Subdirs | Out | Keywords | Topics |',
		'| --- | ---: | ---: | ---: | ---: | --- | --- |',
		...lines,
	].join('\n');
}

/** Full paginated compact folder tree, reused by submit prompt so paths stay grounded. */
function buildFolderTreePagesMarkdown(ctx: HubDiscoveryPrepContext): string {
	if (ctx.world.pages.length === 0) return '_(No folder tree pages available.)_';
	return ctx.world.pages
		.map((p) => `### Folder tree page ${p.pageIndex + 1}/${p.totalPages}\n\n${p.compactTreeMarkdown}`)
		.join('\n\n');
}

export type FolderReconCompleteCallback = (memory: FolderReconMemory) => void;

/**
 * Folder hub recon: plan (optional tools, executed by host) → structured submit. Final state via `onComplete`.
 */
export async function* runFolderHubReconLoop(options: {
	ctx: HubDiscoveryPrepContext;
	stepId: string;
	aiServiceManager: AIServiceManager;
	/** Called once with the final folder memory when the loop ends (stop flag or max iterations). */
	onComplete: FolderReconCompleteCallback;
	/** Debug: iteration cap and/or stop after a specific plan+tools or submit round (1-based). */
	debug?: ReconLoopDebugOptions;
}): AsyncGenerator<LLMStreamEvent, void> {
	const { ctx, stepId, aiServiceManager, onComplete, debug } = options;
	const stopwatch = new Stopwatch('HubDiscovery folder recon');
	const tools = buildFolderHubTools(ctx.tm);
	const budgetDerived = Math.min(6, Math.max(3, Math.floor(ctx.suggestBudget.indexBudgetRaw.limitTotal / 150)));
	const maxIter = effectiveReconMaxIterations(budgetDerived, debug);
	const folderTreeMarkdown = buildFolderTreePagesMarkdown(ctx);
	const folderDigestMarkdown = buildFolderDigestMarkdown(ctx.world.nodes, 100);
	const deepFolderDigestMarkdown = buildDeepFolderDigestMarkdown(ctx.world.nodes, 60);
	let memory = buildInitialFolderReconMemory(ctx);
	const messages: ModelMessage[] = [
		{
			role: 'user',
			content: await aiServiceManager.renderPrompt(PromptId.HubDiscoveryFolderReconPlan, {
				userGoal: ctx.userGoal,
				worldMetricsJson: JSON.stringify(ctx.worldMetricsForPrompt),
				folderDigestMarkdown,
				deepFolderDigestMarkdown,
				baselineExcludedPrefixesJson: JSON.stringify(ctx.baselineExcludedPrefixes),
			}),
		},
	];

	for (let iter = 0; iter < maxIter; iter++) {
		const planSystem = await aiServiceManager.renderPrompt(PromptId.HubDiscoveryFolderReconPlanSystem, {});
		const planMessages: ModelMessage[] = [
			...messages,
			...(iter > 0
				? [
					{
						role: 'user' as const,
						content:
							`[Iteration ${iter + 1}/${maxIter}] Folder recon memory (JSON):\n` +
							JSON.stringify(memory),
					},
				]
				: []),
		];
		yield buildPromptTraceDebugEvent(StreamTriggerName.HUB_DISCOVERY_FOLDER_RECON_PLAN, planSystem, JSON.stringify(planMessages));
		stopwatch.start(`folder recon plan iter ${iter}`);
		const planResult = streamText({
			model: aiServiceManager.getModelInstanceForPrompt(PromptId.HubDiscoveryFolderReconPlan).model,
			system: planSystem,
			messages: planMessages,
			tools,
			toolChoice: 'auto',
		});
		yield* streamTransform(planResult.fullStream, StreamTriggerName.HUB_DISCOVERY_FOLDER_RECON_PLAN, {
			yieldUIStep: { uiType: UIStepType.STEPS_DISPLAY, stepId },
		});
		const planStepMessages: ModelMessage[] = [];
		const planReasoning = (await planResult.reasoning).map((r) => r.text).join('\n');
		if (!isBlankString(planReasoning)) {
			planStepMessages.push({ role: 'assistant', content: planReasoning });
		}
		const planText = await planResult.text;
		if (!isBlankString(planText)) {
			planStepMessages.push({ role: 'assistant', content: planText });
		}
		const toolCalls = await planResult.toolCalls;
		if (toolCalls.length > 0) {
			planStepMessages.push({
				role: 'assistant',
				content: toolCalls.map((tc) => ({
					type: 'tool-call' as const,
					toolCallId: tc.toolCallId,
					toolName: tc.toolName,
					input: tc.input,
				})),
			});
		}
		stopwatch.stop();

		const { full: fullToolMessages, summary: summaryToolMessages } = await executeReconToolCalls(tools, planStepMessages);
		const toolResultsMarkdown =
			fullToolMessages.length > 0
				? fullToolMessages.map((m) => JSON.stringify(m.content)).join('\n\n')
				: '(no tool calls executed)';

		const iterOneBased = iter + 1;
		const actionPlanMarkdown = [planReasoning, planText].filter((x) => !isBlankString(x)).join('\n\n').trim();
		const toolCallsPayload = toolCalls.map((tc) => ({
			toolCallId: tc.toolCallId,
			toolName: tc.toolName,
			input: tc.input,
		}));
		yield {
			type: 'pk-debug',
			debugName: 'HubDiscovery folder recon plan+tools raw',
			extra: {
				iteration: iterOneBased,
				maxIter,
				planReasoning: planReasoning || undefined,
				planText: planText || undefined,
				toolCalls: toolCallsPayload,
				toolResultsMarkdown: toolResultsMarkdown.slice(0, 200) + '(truncated)...',
			},
		};

		if (debug?.stopAfterPlanIteration === iterOneBased) {
			yield {
				type: 'pk-debug',
				debugName: 'HubDiscovery folder recon stop (after plan + tools)',
				extra: {
					stopped: true,
					iteration: iterOneBased,
					maxIter,
					phase: 'folder_plan' as const,
					note: 'Details are in the previous pk-debug: HubDiscovery folder recon plan+tools raw',
				},
			};
			onComplete(memory);
			return;
		}

		const agentPipelineBudget = ctx.worldMetricsForPrompt.agentPipelineBudget;
		const submit = await aiServiceManager.streamObjectWithPrompt(
			PromptId.HubDiscoveryFolderReconSubmit,
			{
				userGoal: ctx.userGoal,
				iteration: iterOneBased,
				agentPipelineBudgetJson: JSON.stringify(
					agentPipelineBudget !== undefined ? agentPipelineBudget : {},
				),
				memoryJson: JSON.stringify(memory),
				folderTreeMarkdown,
				actionPlanMarkdown: actionPlanMarkdown || '(no explicit plan text returned)',
				actionOutputMarkdown: planText || '(no plan text returned)',
				toolResultsMarkdown,
			},
			hubDiscoveryFolderReconSubmitSchema,
		);
		yield {
			type: 'pk-debug',
			debugName: 'hub-discovery-folder-recon-submit',
			triggerName: StreamTriggerName.HUB_DISCOVERY_FOLDER_RECON_SUBMIT,
			extra: {
				iteration: iterOneBased,
				maxIter,
				submit,
			},
		};

		// mergeFolderSubmitIntoMemory
		memory = {
			confirmedFolderHubs: mergeFolderHubCandidatesByPath([
				...memory.confirmedFolderHubs,
				...submit.confirmedFolderHubCandidates,
			]),
			folderNavigationGroups: mergeFolderNavigationGroups([
				...memory.folderNavigationGroups,
				...submit.folderNavigationGroups,
			]),
			rejectedFolderPaths: mergeRejectedFolderPathsByPath([...memory.rejectedFolderPaths, ...submit.rejectedFolderPaths]),
			highwayFolderLeads: mergeHighwayFolderLeadsByPath([...memory.highwayFolderLeads, ...submit.highwayFolderLeads]),
			ignoredPathPrefixes: [...new Set([...memory.ignoredPathPrefixes, ...submit.ignoredPathPrefixes])],
			coverage: submit.updatedCoverage,
			openQuestions: submit.openQuestions ?? memory.openQuestions,
		};
		messages.push(...planStepMessages);
		messages.push(...summaryToolMessages);
		messages.push({
			role: 'assistant',
			content: JSON.stringify({
				findingsSummary: submit.findingsSummary,
				should_stop: submit.should_stop,
				confirmed_count: submit.confirmedFolderHubCandidates.length,
			}),
		});

		if (debug?.stopAfterSubmitIteration === iterOneBased) {
			yield {
				type: 'pk-debug',
				debugName: 'HubDiscovery folder recon stop (after submit)',
				extra: {
					stopped: true,
					iteration: iterOneBased,
					maxIter,
					phase: 'folder_submit' as const,
					memoryAfterMerge: memory,
					note: 'Structured submit payload is in the previous pk-debug: hub-discovery-folder-recon-submit',
				},
			};
			onComplete(memory);
			return;
		}

		if (submit.should_stop) break;
	}

	yield {
		type: 'pk-debug',
		debugName: 'HubDiscovery folder recon complete',
		extra: { stopwatch: stopwatch.toString(), confirmedHubs: memory.confirmedFolderHubs.length },
	};
	onComplete(memory);
}

function mergeFolderHubCandidatesByPath(candidates: FolderHubCandidate[]): FolderHubCandidate[] {
	const byPath = new Map<string, FolderHubCandidate>();
	for (const c of candidates) {
		const p = String(c.path ?? '').trim();
		if (!p) continue;
		const prev = byPath.get(p);
		if (!prev || (c.confidence ?? 0) > (prev.confidence ?? 0)) byPath.set(p, { ...c, path: p });
	}
	return [...byPath.values()].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
}

function mergeHighwayFolderLeadsByPath(leads: HighwayFolderLead[]): HighwayFolderLead[] {
	const byPath = new Map<string, HighwayFolderLead>();
	for (const h of leads) {
		const p = String(h.path ?? '').trim();
		if (!p) continue;
		const prev = byPath.get(p);
		if (!prev || (h.confidence ?? 0) > (prev.confidence ?? 0)) byPath.set(p, { ...h, path: p });
	}
	return [...byPath.values()];
}

function mergeRejectedFolderPathsByPath(entries: RejectedFolderPathEntry[]): RejectedFolderPathEntry[] {
	const byPath = new Map<string, RejectedFolderPathEntry>();
	for (const entry of entries) {
		const p = String(entry.path ?? '').trim();
		if (!p) continue;
		const prev = byPath.get(p);
		if (!prev) {
			byPath.set(p, { ...entry, path: p });
			continue;
		}
		const nextReason = String(entry.reason ?? '').trim();
		const prevReason = String(prev.reason ?? '').trim();
		const shouldReplace =
			!!entry.rejectionKind && !prev.rejectionKind
			|| nextReason.length > prevReason.length;
		if (shouldReplace) byPath.set(p, { ...prev, ...entry, path: p });
	}
	return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function mergeFolderNavigationGroups(groups: FolderNavigationGroup[]): FolderNavigationGroup[] {
	const byKey = new Map<string, FolderNavigationGroup>();
	for (const group of groups) {
		const members = [...new Set((group.memberPaths ?? []).map((p) => String(p ?? '').trim()).filter(Boolean))].sort();
		if (members.length < 2) continue;
		const key = members.join('|');
		const prev = byKey.get(key);
		if (!prev || (group.confidence ?? 0) > (prev.confidence ?? 0)) {
			byKey.set(key, { ...group, memberPaths: members });
		}
	}
	return [...byKey.values()].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
}