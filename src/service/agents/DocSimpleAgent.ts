import { SLICE_CAPS } from '@/core/constant';
import { AIServiceManager } from "@/service/chat/service-manager";
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
import { exploreFolderEnvFromManager } from "@/service/tools/exploreFolderEnv";
import { LLMStreamEvent, StreamTriggerName, UIStepType } from "@/core/providers/types";
import { PromptId } from "@/core/prompt/PromptId";
import { generateUuidWithoutHyphens } from "@/core/utils/id-utils";
import { DocumentLoaderManager } from "@/core/document/loader/helper/DocumentLoaderManager";
import { submitFinalAnswerTool } from "@/service/tools/submit-final-answer";
import { emptyUsage, LLMUsage, mergeTokenUsage } from "@/core/providers/types";
import { getActivityDetailTool } from '@/service/context/context-tools/getActivityDetailTool';
import { getRecentAnalysisResultTool } from '@/service/context/context-tools/getRecentAnalysisResultTool';
import { getWorkingThemeTool } from '@/service/context/context-tools/getWorkingThemeTool';
import { TierController } from '@/service/agents/harness/tier/TierController';
import { defaultTierBindings } from '@/service/agents/harness/tier/bindings';
import { ClaudeAgentSDKBridge } from '@/service/agents/harness-bridge/ClaudeAgentSDKBridge';
import { adaptAgentTools } from '@/service/agents/harness-bridge/agentToolAdapter';
import type { AgentTool } from "@/service/tools/types";

/** Max chars for doc-simple inline file content; beyond this we truncate. */
const DOC_SIMPLE_FILE_CONTENT_MAX_CHARS = 120_000;
const TIER = 'local-deep';

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
 * Runs via the self-hosted harness (tier=local-deep).
 */
export class DocSimpleAgent {
	private readonly tools: Record<string, AgentTool>;

	constructor(private readonly aiServiceManager: AIServiceManager) {
		const tm = this.aiServiceManager.getTemplateManager?.();
		const getSearchClient = () => this.aiServiceManager.getSearchClient();
		const searchSettings = this.aiServiceManager.getSearchSettings();
		this.tools = {
			content_reader: contentReaderTool({
				shortSummaryLength: searchSettings.shortSummaryLength,
				fullSummaryLength: searchSettings.fullSummaryLength,
			}),
			submit_final_answer: submitFinalAnswerTool(),
			inspect_note_context: inspectNoteContextTool(tm),
			graph_traversal: graphTraversalTool(tm),
			find_path: findPathTool(tm),
			find_key_nodes: findKeyNodesTool(tm, getSearchClient),
			find_orphans: findOrphansTool(tm),
			search_by_dimensions: searchByDimensionsTool(tm, getSearchClient),
			explore_folder: exploreFolderTool(tm, undefined, () => exploreFolderEnvFromManager(this.aiServiceManager)),
			recent_changes_whole_vault: recentChangesWholeVaultTool(tm, getSearchClient),
			local_search_whole_vault: localSearchWholeVaultTool(tm, getSearchClient),
			get_activity_detail: getActivityDetailTool(),
			get_recent_analysis: getRecentAnalysisResultTool(this.aiServiceManager.getAnalysisHistory()),
			get_working_theme: getWorkingThemeTool(),
		};
	}

	async *stream(userPrompt: string, opts: { scopeValue?: string }): AsyncGenerator<LLMStreamEvent> {
		const scopeValue = opts?.scopeValue;
		if (!scopeValue || !scopeValue.trim()) {
			yield {
				type: "error",
				error: new Error("DocSimpleAgent requires scopeValue (current file path)."),
				triggerName: StreamTriggerName.DOC_SIMPLE_AGENT,
			};
			return;
		}
		if (!userPrompt || !userPrompt.trim()) {
			yield {
				type: "error",
				error: new Error("DocSimpleAgent requires a non-empty userPrompt."),
				triggerName: StreamTriggerName.DOC_SIMPLE_AGENT,
			};
			return;
		}

		const fileContent = await loadDocSimpleFileContent(scopeValue);
		const prompt = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisDocSimpleScope, {
			scopeValue,
			userPrompt,
			fileContent,
		});
		const system = await this.aiServiceManager.renderPrompt(PromptId.AiAnalysisDocSimpleSystem, {});

		const startedAt = Date.now();

		yield {
			type: "ui-step",
			uiType: UIStepType.STEPS_DISPLAY,
			stepId: generateUuidWithoutHyphens(),
			title: "Answering in current document...",
			description: "DocSimpleAgent is generating an answer.",
			triggerName: StreamTriggerName.DOC_SIMPLE_AGENT,
		};

		const loopId = `doc-simple-${generateUuidWithoutHyphens()}`;
		const tierController = new TierController({
			bindings: defaultTierBindings(this.aiServiceManager.getHarnessSettings()),
			policy: { preferred: TIER },
			loopId,
		});

		const result = await new ClaudeAgentSDKBridge().run({
            app: this.aiServiceManager.getApp(),
            pluginId: this.aiServiceManager.getPluginIdPublic(),
            harnessSettings: this.aiServiceManager.getHarnessSettings(),
			loopId,
			systemPrompt: system,
			initialMessages: [{ role: 'user', content: prompt }],
			tools: adaptAgentTools(this.tools),
			tierController,
			budget: { maxSteps: 15, maxTokens: 80_000, maxToolCalls: 30 },
		});

		const finalAnswerText = result.finalText.trim() || "(No answer generated.)";
		let totalUsage: LLMUsage = emptyUsage();
		if (result.totalTokens > 0) {
			totalUsage = mergeTokenUsage(totalUsage, { inputTokens: 0, outputTokens: 0, totalTokens: result.totalTokens });
		}

		// Emit text delta
		if (finalAnswerText) {
			yield {
				type: 'text-delta',
				text: finalAnswerText,
				triggerName: StreamTriggerName.DOC_SIMPLE_AGENT,
			} as any;
		}

		// Generate title
		let title: string | undefined = undefined;
		const titleStream = this.aiServiceManager.queryStream(
			PromptId.AiAnalysisTitle,
			{
				query: userPrompt,
				summary: finalAnswerText,
			},
		);
		let titleAcc = '';
		for await (const chunk of titleStream) {
			if (chunk.type === 'text-delta' && typeof (chunk as any).text === 'string') {
				titleAcc += (chunk as any).text;
			} else if (chunk.type === 'complete') {
				if (titleAcc) title = titleAcc.trim() || undefined;
				const ev = chunk as { usage?: any };
				if (ev.usage) totalUsage = mergeTokenUsage(totalUsage, ev.usage);
			}
			yield { ...chunk, triggerName: StreamTriggerName.DOC_SIMPLE_AGENT };
		}
		if (!title) title = userPrompt.trim().slice(0, SLICE_CAPS.agent.docSimpleTitle);

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
			},
			triggerName: StreamTriggerName.DOC_SIMPLE_AGENT,
		};
	}
}
