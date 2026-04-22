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
import { LLMStreamEvent, StreamTriggerName, UIStepType } from "@/core/providers/types";
import { PromptId } from "@/service/prompt/PromptId";
import { generateUuidWithoutHyphens } from "@/core/utils/id-utils";
import { DocumentLoaderManager } from "@/core/document/loader/helper/DocumentLoaderManager";
import { submitFinalAnswerTool } from "@/service/tools/submit-final-answer";
import { emptyUsage, LLMUsage, mergeTokenUsage } from "@/core/providers/types";
import { AppContext } from "@/app/context/AppContext";
import { ProfileRegistry } from "@/core/profiles/ProfileRegistry";
import { queryWithProfile } from "./core/sdkAgentPool";
import { translateSdkMessages } from "./core/sdkMessageAdapter";
import { agentToolsToMcpServer, mcpToolNames } from "./core/agentToolMcpAdapter";
import type { AgentTool } from "@/service/tools/types";

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

const MCP_SERVER_NAME = 'doc';

/**
 * DocSimpleAgent: single-file quick Q&A. Same tools as RawSearchAgent, different prompt.
 * Uses Agent SDK query() via MCP server for tool dispatch.
 */
export class DocSimpleAgent {
	private readonly tools: Record<string, AgentTool>;

	constructor(private readonly aiServiceManager: AIServiceManager) {
		const tm = this.aiServiceManager.getTemplateManager?.();
		this.tools = {
			content_reader: contentReaderTool(),
			submit_final_answer: submitFinalAnswerTool(),
			inspect_note_context: inspectNoteContextTool(tm),
			graph_traversal: graphTraversalTool(tm),
			find_path: findPathTool(tm),
			find_key_nodes: findKeyNodesTool(tm),
			find_orphans: findOrphansTool(tm),
			search_by_dimensions: searchByDimensionsTool(tm),
			explore_folder: exploreFolderTool(tm),
			recent_changes_whole_vault: recentChangesWholeVaultTool(tm),
			local_search_whole_vault: localSearchWholeVaultTool(tm),
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

		// Build MCP server from tools and call Agent SDK
		const ctx = AppContext.getInstance();
		const profile = ProfileRegistry.getInstance().getActiveAgentProfile()!;
		const mcpServer = agentToolsToMcpServer(MCP_SERVER_NAME, this.tools);
		const allowedTools = mcpToolNames(MCP_SERVER_NAME, this.tools);

		const messages = queryWithProfile(ctx.app, ctx.pluginId, profile, {
			prompt,
			systemPrompt: system,
			maxTurns: 15,
			mcpServers: { [MCP_SERVER_NAME]: mcpServer },
			allowedTools,
		});

		let answerText: string[] = [];
		let totalUsage: LLMUsage = emptyUsage();

		for await (const ev of translateSdkMessages(messages, {
			triggerName: StreamTriggerName.DOC_SIMPLE_AGENT,
			hasPartialMessages: true,
		})) {
			// Collect text from text-delta events
			if (ev.type === 'text-delta' && typeof (ev as any).text === 'string') {
				answerText.push((ev as any).text);
			}
			// Collect usage from complete events
			if (ev.type === 'complete' && (ev as any).usage) {
				totalUsage = mergeTokenUsage(totalUsage, (ev as any).usage);
			}
			yield ev;
		}

		const finalAnswerText = answerText.join('').trim() || "(No answer generated.)";

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
			// Provider v2: Agent SDK emits text-delta + complete
			if (chunk.type === 'text-delta' && typeof (chunk as any).text === 'string') {
				titleAcc += (chunk as any).text;
			} else if (chunk.type === 'complete') {
				if (titleAcc) title = titleAcc.trim() || undefined;
				const ev = chunk as { usage?: any };
				if (ev.usage) totalUsage = mergeTokenUsage(totalUsage, ev.usage);
			}
			// Legacy PromptService events (fallback compat)
			if (chunk.type === 'prompt-stream-result') {
				title = String((chunk as any).output ?? '').trim() || undefined;
				totalUsage = mergeTokenUsage(totalUsage, (chunk as any).usage);
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
				suggestedFollowUpQuestions: [],
			},
			triggerName: StreamTriggerName.DOC_SIMPLE_AGENT,
		};
	}
}
