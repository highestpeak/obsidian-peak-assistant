import { AIServiceManager } from "@/service/chat/service-manager";
import { Experimental_Agent as Agent, hasToolCall } from "ai";
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
import { buildToolCallUIEvent } from "./RawSearchAgent";
import { submitFinalAnswerTool } from "@/service/tools/submit-final-answer";
import { streamTransform } from "@/core/providers/helpers/stream-helper";
import { emptyUsage, LLMUsage, mergeTokenUsage } from "@/core/providers/types";

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
				inspect_note_context: inspectNoteContextTool(this.aiServiceManager.getTemplateManager?.()),
				graph_traversal: graphTraversalTool(this.aiServiceManager.getTemplateManager?.()),
				find_path: findPathTool(this.aiServiceManager.getTemplateManager?.()),
				find_key_nodes: findKeyNodesTool(this.aiServiceManager.getTemplateManager?.()),
				find_orphans: findOrphansTool(this.aiServiceManager.getTemplateManager?.()),
				search_by_dimensions: searchByDimensionsTool(this.aiServiceManager.getTemplateManager?.()),
				explore_folder: exploreFolderTool(this.aiServiceManager.getTemplateManager?.()),
				recent_changes_whole_vault: recentChangesWholeVaultTool(this.aiServiceManager.getTemplateManager?.()),
				local_search_whole_vault: localSearchWholeVaultTool(this.aiServiceManager.getTemplateManager?.()),
			},
			stopWhen: [
				hasToolCall('submit_final_answer'),
			],
			temperature,
			maxOutputTokens,
		});
	}

	async *stream(userPrompt: string, opts: { scopeValue?: string }): AsyncGenerator<LLMStreamEvent> {
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
		const system = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisDocSimpleSystem, {});

		const result = this.searchAgent.stream({ system, prompt });
		const startedAt = Date.now();

		yield {
			type: "ui-step",
			uiType: UIStepType.STEPS_DISPLAY,
			stepId: generateUuidWithoutHyphens(),
			title: "Answering in current document...",
			description: "DocSimpleAgent is generating an answer.",
			triggerName: StreamTriggerName.DOC_SIMPLE_AGENT,
		};
		let answerText: string[] = [];
		let totalUsage: LLMUsage = emptyUsage();
		yield* streamTransform(result.fullStream, StreamTriggerName.DOC_SIMPLE_AGENT, {
			yieldUIStep: {
				uiType: UIStepType.STEPS_DISPLAY,
				stepId: generateUuidWithoutHyphens(),
				uiEventGenerator: (chunk: any) => {
					if (chunk.type === 'tool-call') {
						return buildToolCallUIEvent(chunk, generateUuidWithoutHyphens());
					}
				},
			},
			chunkEventInterceptor: (chunk: any) => {
				if (chunk.type === "text-delta") {
					answerText.push(chunk.delta);
				}
			},
			yieldEventPostProcessor: (chunk: any) => {
				if (chunk.type === 'finish') {
					totalUsage = mergeTokenUsage(totalUsage, chunk.usage);
				}
				return {};
			},
		});
		const finalAnswerText = answerText.join('').trim() || "(No answer generated.)";

		// Generate title
		let title: string | undefined = undefined;
		const stream = this.aiServiceManager.chatWithPromptStream(
			PromptId.AiAnalysisTitle,
			{
				query: userPrompt,
				summary: finalAnswerText,
			},
		);
		for await (const chunk of stream) {
			if (chunk.type === 'prompt-stream-result') {
				title = String(chunk.output ?? '').trim() || undefined;
				totalUsage = mergeTokenUsage(totalUsage, chunk.usage);
			}
			yield { ...chunk, triggerName: StreamTriggerName.DOC_SIMPLE_AGENT };
		}
		if (!title) title = userPrompt.trim().slice(0, 80);

		yield {
			type: "complete",
			finishReason: "stop",
			usage: totalUsage,
			durationMs: Date.now() - startedAt,
			result: {
				title,
				summary: finalAnswerText,
				topics: [],
				sources: [],
				graph: { nodes: [], edges: [] },
				dashboardBlocks: [],
				suggestedFollowUpQuestions: [],
			},
			triggerName: StreamTriggerName.DOC_SIMPLE_AGENT,
		};
	}
}
