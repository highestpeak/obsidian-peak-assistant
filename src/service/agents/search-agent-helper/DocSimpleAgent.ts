import { AIServiceManager } from "@/service/chat/service-manager";
import { Experimental_Agent as Agent, hasToolCall, stepCountIs } from "ai";
import { AgentTool } from "@/service/tools/types";
import { contentReaderTool } from "@/service/tools/content-reader";
import {
	inspectNoteContextTool,
	graphTraversalTool,
	findPathTool,
	findKeyNodesTool,
	findOrphansTool,
	searchByDimensionsTool,
	exploreFolderTool,
	recentChangesWholeVaultTool,
	localSearchWholeVaultTool,
} from "@/service/tools/search-graph-inspector";
import { LLMStreamEvent, StreamTriggerName, UIStepType } from "@/core/providers/types";
import { PromptId } from "@/service/prompt/PromptId";
import { generateUuidWithoutHyphens } from "@/core/utils/id-utils";
import { DocumentLoaderManager } from "@/core/document/loader/helper/DocumentLoaderManager";
import { buildToolCallUIEvent, DEFAULT_MAX_SEARCH_AGENT_STEPS } from "./RawSearchAgent";
import { submitFinalAnswerTool } from "@/service/tools/submit-final-answer";
import { getDeltaEventDeltaText } from "@/core/providers/helpers/stream-helper";

type DocSimpleToolSet = {
	content_reader: AgentTool;
	submit_final_answer: AgentTool;
	inspect_note_context: AgentTool;
	graph_traversal: AgentTool;
	find_path: AgentTool;
	find_key_nodes: AgentTool;
	find_orphans: AgentTool;
	search_by_dimensions: AgentTool;
	explore_folder: AgentTool;
	recent_changes_whole_vault: AgentTool;
	local_search_whole_vault: AgentTool;
};

/** Max chars for doc-simple inline file content; beyond this we truncate. */
const DOC_SIMPLE_FILE_CONTENT_MAX_CHARS = 120_000;

async function loadDocSimpleFileContent(filePath: string): Promise<string> {
	const document = await DocumentLoaderManager.getInstance().readByPath(filePath, true);
	if (!document) return "(File not found or not readable.)";
	const raw = (document.sourceFileInfo?.content ?? document.cacheFileInfo?.content ?? "").toString();
	if (!raw) return "(No content found.)";
	if (raw.length <= DOC_SIMPLE_FILE_CONTENT_MAX_CHARS) return raw;
	return (
		raw.slice(0, DOC_SIMPLE_FILE_CONTENT_MAX_CHARS) +
		`\n\n[... content truncated; ${raw.length - DOC_SIMPLE_FILE_CONTENT_MAX_CHARS} more chars. Use content_reader (range/grep) for specific sections if needed ...]`
	);
}

/**
 * DocSimpleAgent: single-file quick Q&A. Same tools as RawSearchAgent, different prompt.
 * Rewrites text-delta/reasoning-delta to prompt-stream-* with AiAnalysisSummary so useAIAnalysis displays in summary.
 */
export class DocSimpleAgent {
	private searchAgent: Agent<DocSimpleToolSet>;

	constructor(private readonly aiServiceManager: AIServiceManager) {
		const { provider, modelId } = this.aiServiceManager.getModelForPrompt(PromptId.AiAnalysisDocSimpleSystem);
		const outputControl = this.aiServiceManager.getSettings?.()?.defaultOutputControl;
		const temperature = outputControl?.temperature ?? 0.3;
		const maxOutputTokens = outputControl?.maxOutputTokens ?? 4096;

		this.searchAgent = new Agent<DocSimpleToolSet>({
			model: this.aiServiceManager.getMultiChat().getProviderService(provider).modelClient(modelId),
			tools: {
				content_reader: contentReaderTool(),
				submit_final_answer: submitFinalAnswerTool(),
				inspect_note_context: inspectNoteContextTool(),
				graph_traversal: graphTraversalTool(),
				find_path: findPathTool(),
				find_key_nodes: findKeyNodesTool(),
				find_orphans: findOrphansTool(),
				search_by_dimensions: searchByDimensionsTool(),
				explore_folder: exploreFolderTool(),
				recent_changes_whole_vault: recentChangesWholeVaultTool(),
				local_search_whole_vault: localSearchWholeVaultTool(),
			},
			stopWhen: [
				stepCountIs(DEFAULT_MAX_SEARCH_AGENT_STEPS),
				hasToolCall('submit_final_answer'),
			],
			temperature,
			maxOutputTokens,
		});
	}

	async stream(userPrompt: string, opts: { scopeValue?: string }): Promise<AsyncGenerator<LLMStreamEvent>> {
		const scopeValue = opts?.scopeValue;
		if (!scopeValue || !scopeValue.trim()) {
			return (async function* (): AsyncGenerator<LLMStreamEvent> {
				yield {
					type: "error",
					error: new Error("DocSimpleAgent requires scopeValue (current file path)."),
					triggerName: StreamTriggerName.DOC_SIMPLE_AGENT,
				};
			})();
		}
		if (!userPrompt || !userPrompt.trim()) {
			return (async function* (): AsyncGenerator<LLMStreamEvent> {
				yield {
					type: "error",
					error: new Error("DocSimpleAgent requires a non-empty userPrompt."),
					triggerName: StreamTriggerName.DOC_SIMPLE_AGENT,
				};
			})();
		}

		const fileContent = await loadDocSimpleFileContent(scopeValue);
		const prompt = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisDocSimpleScope, {
			scopeValue,
			userPrompt,
			fileContent,
		});
		const system = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisDocSimpleSystem, null);

		const result = this.searchAgent.stream({ system, prompt });
		const startedAt = Date.now();
		const svc = this.aiServiceManager;

		let textRunId = generateUuidWithoutHyphens();
		let reasoningRunId = generateUuidWithoutHyphens();
		return (async function* (): AsyncGenerator<LLMStreamEvent> {
			let answerText = "";
			let totalUsage: any = undefined;

			yield {
				type: "ui-step",
				uiType: UIStepType.STEPS_DISPLAY,
				stepId: generateUuidWithoutHyphens(),
				title: "Answering in current document...",
				description: "DocSimpleAgent is generating an answer.",
				triggerName: StreamTriggerName.DOC_SIMPLE_AGENT,
			};

			for await (const chunk of result.fullStream) {
				switch (chunk.type) {
					case "text-start":
						yield {
							type: "ui-step",
							uiType: UIStepType.STEPS_DISPLAY,
							stepId: generateUuidWithoutHyphens(),
							title: "Answering in current document... Thinking...",
							description: "Thinking about the request...",
							triggerName: StreamTriggerName.DOC_SIMPLE_AGENT,
						};
						textRunId = generateUuidWithoutHyphens();
						yield { type: "prompt-stream-start", id: textRunId, promptId: PromptId.AiAnalysisSummary };
						break;
					case "text-delta": {
						const delta = getDeltaEventDeltaText(chunk);
						answerText += delta;
						yield { type: "prompt-stream-delta", id: textRunId, promptId: PromptId.AiAnalysisSummary, delta };
						yield {
							type: "ui-step-delta",
							uiType: UIStepType.STEPS_DISPLAY,
							stepId: textRunId,
							descriptionDelta: delta,
							triggerName: StreamTriggerName.DOC_SIMPLE_AGENT,
						};
						break;
					}
					case "reasoning-start":
						reasoningRunId = generateUuidWithoutHyphens();
						yield {
							type: "ui-step",
							uiType: UIStepType.STEPS_DISPLAY,
							stepId: reasoningRunId,
							title: "Answering in current document... Reasoning...",
							description: "Reasoning about the request...",
							triggerName: StreamTriggerName.DOC_SIMPLE_AGENT,
						};
						break;
					case "reasoning-delta": {
						const delta = getDeltaEventDeltaText(chunk);
						yield {
							type: "ui-step-delta",
							uiType: UIStepType.STEPS_DISPLAY,
							stepId: reasoningRunId,
							descriptionDelta: delta,
							triggerName: StreamTriggerName.DOC_SIMPLE_AGENT,
						};
						break;
					}
					case "tool-call": {
						const callId = (chunk as any).toolCallId ?? `docsimple-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
						yield {
							type: "tool-call",
							id: callId,
							toolName: (chunk as any).toolName,
							input: (chunk as any).input,
							triggerName: StreamTriggerName.DOC_SIMPLE_AGENT,
						};
						const uiEvent = buildToolCallUIEvent(chunk, generateUuidWithoutHyphens());
						if (uiEvent) yield uiEvent;
						break;
					}
					case "tool-result": {
						const resultId = (chunk as any).toolCallId ?? `docsimple-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
						yield {
							type: "tool-result",
							id: resultId,
							toolName: (chunk as any).toolName,
							input: (chunk as any).input,
							output: (chunk as any).output,
							triggerName: StreamTriggerName.DOC_SIMPLE_AGENT,
						};
						break;
					}
					case "tool-error": {
						const errMsg =
							typeof (chunk as any).error === "string"
								? (chunk as any).error
								: (chunk as any).error?.message ?? JSON.stringify((chunk as any).error);
						const toolName = (chunk as any).toolName ?? "unknown";
						yield {
							type: "error",
							error: new Error(`Tool ${toolName} failed: ${errMsg}`),
							triggerName: StreamTriggerName.DOC_SIMPLE_AGENT,
							extra: { toolName, toolCallId: (chunk as any).toolCallId },
						};
						break;
					}
					case "finish":
						totalUsage = (chunk as any).totalUsage;
						break;
					default:
						break;
				}
			}

			// Generate title
			let title: string | undefined = undefined;
			try {
				const t = await svc.chatWithPrompt(PromptId.AiAnalysisTitle, {
					query: userPrompt,
					summary: answerText.trim() || undefined,
				});
				title = typeof t === "string" ? t.trim() : "";
				if (!title) title = userPrompt.trim().slice(0, 80);
			} catch {
				title = userPrompt.trim().slice(0, 80);
			}

			yield {
				type: "complete",
				finishReason: "stop",
				usage: totalUsage,
				durationMs: Date.now() - startedAt,
				result: {
					title,
					summary: answerText.trim() || "(No answer generated.)",
					topics: [],
					sources: [],
					graph: { nodes: [], edges: [] },
					dashboardBlocks: [],
					suggestedFollowUpQuestions: [],
				},
				triggerName: StreamTriggerName.DOC_SIMPLE_AGENT,
			};
		})();
	}
}
