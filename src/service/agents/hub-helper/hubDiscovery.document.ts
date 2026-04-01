/**
 * Document-hub recon: graph-heavy tools → structured submit loop (after folder-hub memory exists).
 */

import { streamText } from 'ai';
import type { ModelMessage } from 'ai';
import { hubDiscoveryDocumentReconSubmitSchema } from '@/core/schemas';
import { isBlankString } from '@/core/utils/common-utils';
import { buildPromptTraceDebugEvent, streamTransform } from '@/core/providers/helpers/stream-helper';
import { StreamTriggerName, UIStepType, type LLMStreamEvent } from '@/core/providers/types';
import { Stopwatch } from '@/core/utils/Stopwatch';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { PromptId } from '@/service/prompt/PromptId';
import { buildInitialDocumentReconMemory, mergeDocumentSubmitIntoMemory } from './hubDiscovery.memory';
import { buildDocumentHubTools, executeReconToolCalls } from './hubDiscovery.tools';
import { effectiveReconMaxIterations, type ReconLoopDebugOptions } from './hubDiscoveryDebug';
import type { DocumentReconMemory, FolderReconMemory, HubDiscoveryPrepContext } from './types';

export type DocumentReconCompleteCallback = (memory: DocumentReconMemory) => void;

/**
 * Document hub recon: graph tools → structured submit. Final state via `onComplete`, not generator return.
 */
export async function* runDocumentHubReconLoop(options: {
	ctx: HubDiscoveryPrepContext;
	folderMemory: FolderReconMemory;
	stepId: string;
	aiServiceManager: AIServiceManager;
	onComplete: DocumentReconCompleteCallback;
	debug?: ReconLoopDebugOptions;
}): AsyncGenerator<LLMStreamEvent, void> {
	const { ctx, folderMemory, stepId, aiServiceManager, onComplete, debug } = options;
	const stopwatch = new Stopwatch('HubDiscovery document recon');
	const tools = buildDocumentHubTools(ctx.tm);
	const budgetDerived = Math.min(6, Math.max(3, Math.floor(ctx.suggestBudget.indexBudgetRaw.limitTotal / 180)));
	const maxIter = effectiveReconMaxIterations(budgetDerived, debug);
	let memory = buildInitialDocumentReconMemory();
	const messages: ModelMessage[] = [
		{
			role: 'user',
			content: await aiServiceManager.renderPrompt(PromptId.HubDiscoveryDocumentReconPlan, {
				userGoal: ctx.userGoal,
				folderHubCandidatesJson: JSON.stringify(folderMemory.confirmedFolderHubs),
				highwayFolderLeadsJson: JSON.stringify(folderMemory.highwayFolderLeads),
				documentShortlistJson: JSON.stringify(ctx.initialDocumentShortlist),
				topOutgoingFoldersJson: JSON.stringify(ctx.world.metrics.topOutgoingFolders),
			}),
		},
	];

	for (let iter = 0; iter < maxIter; iter++) {
		const system = await aiServiceManager.renderPrompt(PromptId.HubDiscoveryDocumentReconPlanSystem, {});
		const planMessages: ModelMessage[] = [
			...messages,
			...(iter > 0
				? [
						{
							role: 'user' as const,
							content:
								`[Iteration ${iter + 1}/${maxIter}] Document recon memory (JSON):\n` +
								JSON.stringify(memory),
						},
				  ]
				: []),
		];
		yield buildPromptTraceDebugEvent(
			StreamTriggerName.HUB_DISCOVERY_DOCUMENT_RECON_PLAN,
			system,
			JSON.stringify(planMessages),
		);
		stopwatch.start(`document recon plan iter ${iter}`);
		const stepResult = streamText({
			// Use the user prompt id for model selection (system prompts are not configurable).
			model: aiServiceManager.getModelInstanceForPrompt(PromptId.HubDiscoveryDocumentReconPlan).model,
			system,
			messages: planMessages,
			tools,
			toolChoice: 'required',
		});
		yield* streamTransform(stepResult.fullStream, StreamTriggerName.HUB_DISCOVERY_DOCUMENT_RECON_PLAN, {
			yieldUIStep: { uiType: UIStepType.STEPS_DISPLAY, stepId },
		});
		const planStepMessages: ModelMessage[] = [];
		const responseReasoning = (await stepResult.reasoning).map((r) => r.text).join('\n');
		if (!isBlankString(responseReasoning)) {
			planStepMessages.push({ role: 'assistant', content: responseReasoning });
		}
		const responseText = await stepResult.text;
		if (!isBlankString(responseText)) {
			planStepMessages.push({ role: 'assistant', content: responseText });
		}
		const toolCalls = await stepResult.toolCalls;
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
		const toolCallsPayload = toolCalls.map((tc) => ({
			toolCallId: tc.toolCallId,
			toolName: tc.toolName,
			input: tc.input,
		}));
		yield {
			type: 'pk-debug',
			debugName: 'HubDiscovery document recon plan+tools raw',
			extra: {
				iteration: iterOneBased,
				maxIter,
				reasoning: responseReasoning || undefined,
				responseText: responseText || undefined,
				toolCalls: toolCallsPayload,
				toolResultsMarkdown,
				memoryBeforeSubmit: memory,
			},
		};

		if (debug?.stopAfterPlanIteration === iterOneBased) {
			yield {
				type: 'pk-debug',
				debugName: 'HubDiscovery document recon stop (after plan + tools)',
				extra: {
					stopped: true,
					iteration: iterOneBased,
					maxIter,
					phase: 'document_plan' as const,
					note: 'Details are in the previous pk-debug: HubDiscovery document recon plan+tools raw',
				},
			};
			onComplete(memory);
			return;
		}

		const submit = await aiServiceManager.streamObjectWithPrompt(
			PromptId.HubDiscoveryDocumentReconSubmit,
			{
				userGoal: ctx.userGoal,
				iteration: iter + 1,
				memoryJson: JSON.stringify(memory),
				toolResultsMarkdown,
			},
			hubDiscoveryDocumentReconSubmitSchema,
		);
		yield {
			type: 'pk-debug',
			debugName: 'hub-discovery-document-recon-submit',
			triggerName: StreamTriggerName.HUB_DISCOVERY_DOCUMENT_RECON_SUBMIT,
			extra: {
				iteration: iterOneBased,
				leads: submit.refinedDocumentHubLeads.length,
				confirmed_paths: submit.confirmedDocumentHubPaths.length,
				should_stop: submit.should_stop,
				submit,
			},
		};

		memory = mergeDocumentSubmitIntoMemory(memory, submit);
		messages.push(...planStepMessages);
		messages.push(...summaryToolMessages);
		messages.push({
			role: 'assistant',
			content: JSON.stringify({
				findingsSummary: submit.findingsSummary,
				should_stop: submit.should_stop,
			}),
		});

		if (debug?.stopAfterSubmitIteration === iterOneBased) {
			yield {
				type: 'pk-debug',
				debugName: 'HubDiscovery document recon stop (after submit)',
				extra: {
					stopped: true,
					iteration: iterOneBased,
					maxIter,
					phase: 'document_submit' as const,
					memoryAfterMerge: memory,
					note: 'Structured submit payload is in the previous pk-debug: hub-discovery-document-recon-submit',
				},
			};
			onComplete(memory);
			return;
		}

		if (submit.should_stop) break;
	}

	yield {
		type: 'pk-debug',
		debugName: 'HubDiscovery document recon complete',
		extra: { stopwatch: stopwatch.toString(), leads: memory.refinedDocumentHubLeads.length },
	};
	onComplete(memory);
}
