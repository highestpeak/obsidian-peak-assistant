/**
 * Harness-native adapters for the Vault Search tools.
 *
 * `vault-sdk/vaultMcpServer.ts` still owns the pure implementations because
 * the SDK path uses them today. This file wraps the same implementations in
 * the self-hosted harness `ToolDef` shape so the VaultSearchAgent migration
 * can move one layer at a time without duplicating tool logic.
 */

import { z } from 'zod';
import type { AppHandle } from '@/core/ports/AppHandle';
import type { AnalysisHistoryPort } from '@/core/ports/AnalysisHistoryPort';
import type { ToolDef, ToolResult } from '@/service/agents/harness/tool/types';
import { fail, ok } from '@/service/agents/harness/tool/types';
import { getActivityDetailTool } from '@/service/context/context-tools/getActivityDetailTool';
import { getRecentAnalysisResultTool } from '@/service/context/context-tools/getRecentAnalysisResultTool';
import { getWorkingThemeTool } from '@/service/context/context-tools/getWorkingThemeTool';
import {
	grepImpl,
	listFoldersImpl,
	readFolderImpl,
	readNoteImpl,
	wikilinkExpandImpl,
	type GrepSearchFn,
	type SubmitPlanFeedback,
	type SubmitPlanInput,
} from '@/service/agents/vault-sdk/vaultMcpServer';

const VAULT_TOOL_PREFIX = 'mcp__vault__';

export const VAULT_SUBMIT_PLAN_TOOL_NAME = `${VAULT_TOOL_PREFIX}vault_submit_plan`;

export interface SubmitPlanState {
	submitted: boolean;
	plans: SubmitPlanInput[];
	lastFeedback: SubmitPlanFeedback | null;
}

export interface VaultHarnessToolDeps {
	app: AppHandle;
	searchFn: GrepSearchFn;
	onSubmitPlan: (plan: SubmitPlanInput) => Promise<SubmitPlanFeedback>;
	analysisHistory: AnalysisHistoryPort;
	submitState?: SubmitPlanState;
}

export function createSubmitPlanState(): SubmitPlanState {
	return {
		submitted: false,
		plans: [],
		lastFeedback: null,
	};
}

export function buildVaultHarnessTools(deps: VaultHarnessToolDeps): ToolDef[] {
	const submitState = deps.submitState ?? createSubmitPlanState();
	return [
		readTool('vault_list_folders', 'List top-level folders in the vault with markdown file counts. Call first for reflective queries.', z.object({
			maxDepth: z.number().min(1).max(5).default(2),
		}), (input) => listFoldersImpl(deps.app.vault, input)),
		readTool('vault_read_folder', 'List markdown files in a specific folder. Recursive by default.', z.object({
			folder: z.string(),
			recursive: z.boolean().default(true),
		}), (input) => readFolderImpl(deps.app.vault, input)),
		readTool('vault_read_note', 'Read a single note: frontmatter, wikilinks, tags, and body preview.', z.object({
			path: z.string(),
			maxChars: z.number().min(100).max(20000).default(5000),
		}), (input) => readNoteImpl(deps.app.vault, deps.app.metadataCache, input)),
		readTool('vault_grep', 'Full-text keyword search across the vault using the existing hybrid SearchClient path.', z.object({
			query: z.string(),
			limit: z.number().min(1).max(50).default(20),
		}), (input) => grepImpl(deps.searchFn, input)),
		readTool('vault_wikilink_expand', 'Follow wikilinks from a starting note up to a bounded hop depth.', z.object({
			startPath: z.string(),
			maxSteps: z.number().min(1).max(4).default(2),
		}), (input) => wikilinkExpandImpl(deps.app.vault, deps.app.metadataCache, input)),
		{
			name: VAULT_SUBMIT_PLAN_TOOL_NAME,
			description: 'Call when enough evidence has been gathered to propose a report plan for review.',
			source: 'mcp',
			kind: 'meta',
			inputSchema: z.object({
				selected_paths: z.array(z.string()),
				rationale: z.string(),
				proposed_outline: z.string(),
				coverage_assessment: z.string(),
				follow_up_questions: z.array(z.string()).min(3).max(5),
				plan_sections: z.array(z.object({
					id: z.string(),
					title: z.string(),
					content_type: z.enum(['enumeration', 'comparison', 'analysis', 'recommendation', 'timeline']),
					visual_type: z.enum(['table', 'quadrantChart', 'flowchart', 'timeline', 'mindmap', 'none']),
					evidence_paths: z.array(z.string()),
					brief: z.string(),
					weight: z.number().min(0).max(10),
					mission_role: z.enum([
						'synthesis',
						'contradictions',
						'trade_off',
						'action_plan',
						'risk_audit',
						'roadmap',
						'decomposition',
						'blindspots',
						'probing_horizon',
					]),
				})).optional(),
			}),
			execute: async (input: SubmitPlanInput) =>
				runTool(async () => {
					submitState.submitted = true;
					submitState.plans.push(input);
					const feedback = await deps.onSubmitPlan(input);
					submitState.lastFeedback = feedback;
					return feedback;
				}),
		},
		agentTool('get_activity_detail', getActivityDetailTool()),
		agentTool('get_recent_analysis', getRecentAnalysisResultTool(deps.analysisHistory)),
		agentTool('get_working_theme', getWorkingThemeTool()),
	];
}

function prefixed(name: string): string {
	return `${VAULT_TOOL_PREFIX}${name}`;
}

function readTool<TInput, TOutput>(
	name: string,
	description: string,
	inputSchema: ToolDef<TInput, TOutput>['inputSchema'],
	execute: (input: TInput) => Promise<TOutput>,
): ToolDef<TInput, TOutput> {
	return {
		name: prefixed(name),
		description,
		inputSchema,
		source: 'mcp',
		kind: 'read',
		execute: async (input) => runTool(() => execute(input)),
	};
}

function agentTool(name: string, tool: import('@/service/tools/types').AgentTool): ToolDef {
	return {
		name: prefixed(name),
		description: tool.description,
		inputSchema: tool.inputSchema,
		source: 'mcp',
		kind: 'read',
		execute: async (input) => runTool(() => tool.execute(input)),
	};
}

async function runTool<T>(fn: () => Promise<T>): Promise<ToolResult<T>> {
	try {
		return ok(await fn());
	} catch (err) {
		return fail(err instanceof Error ? err.message : String(err), true);
	}
}
