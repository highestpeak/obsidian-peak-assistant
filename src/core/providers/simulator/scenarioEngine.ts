import { DEFAULT_SIMULATOR_PROFILE_CONFIG } from '@/core/profiles/types';
import type { SimulatorRequest, SimulatorResponseIntent, SimulatorToolResult } from './types';
import {
	captureSimulatorSectionTitle,
	containsCjk,
	resolveSimulatorDelay,
	resolveSimulatorLanguageCopy,
	SIMULATOR_DEFAULTS,
	SIMULATOR_PATTERNS,
} from './SimulatorDefaults';

const TOOL = {
	listFolders: 'mcp__vault__vault_list_folders',
	readFolder: 'mcp__vault__vault_read_folder',
	readNote: 'mcp__vault__vault_read_note',
	submitPlan: 'mcp__vault__vault_submit_plan',
	escalate: 'escalate',
} as const;

interface FolderResult {
	folders?: Array<{ path?: string; mdCount?: number }>;
	totalMdFiles?: number;
}

interface ReadFolderResult {
	files?: Array<{ path?: string; basename?: string }>;
}

export function resolveSimulatorIntent(request: SimulatorRequest): SimulatorResponseIntent {
	const config = { ...DEFAULT_SIMULATOR_PROFILE_CONFIG, ...request.config };
	const planning = request.availableTools.includes(TOOL.submitPlan);

	if (planning && config.scenario === 'planning-failure') {
		return { kind: 'error', message: SIMULATOR_DEFAULTS.errors.planning };
	}

	if (planning) {
		if (config.scenario === 'empty-vault') {
			return submitPlanIntent([], 0, containsCjk(extractSimulatorPromptText(request.prompt)));
		}
		return resolvePlanningIntent(request);
	}

	if (config.scenario === 'report-total-failure') {
		return { kind: 'error', message: SIMULATOR_DEFAULTS.errors.totalReport };
	}

	return resolveOneShotIntent(request);
}

export function simulatorDelayMs(request: Pick<SimulatorRequest, 'config'>): number {
	return resolveSimulatorDelay(request.config);
}

export function extractSimulatorToolResults(prompt: unknown[]): SimulatorToolResult[] {
	const results: SimulatorToolResult[] = [];
	for (const message of prompt) {
		if (!message || typeof message !== 'object') continue;
		const content = (message as { content?: unknown }).content;
		if (!Array.isArray(content)) continue;
		for (const part of content) {
			if (!part || typeof part !== 'object') continue;
			const candidate = part as {
				type?: string;
				toolName?: string;
				output?: unknown;
			};
			if (candidate.type !== 'tool-result' || !candidate.toolName) continue;
			results.push({
				toolName: candidate.toolName,
				value: unwrapToolOutput(candidate.output),
			});
		}
	}
	return results;
}

export function extractSimulatorPromptText(prompt: unknown[]): string {
	const chunks: string[] = [];
	for (const message of prompt) {
		if (!message || typeof message !== 'object') continue;
		const content = (message as { content?: unknown }).content;
		if (typeof content === 'string') {
			chunks.push(content);
			continue;
		}
		if (!Array.isArray(content)) continue;
		for (const part of content) {
			if (!part || typeof part !== 'object') continue;
			const text = (part as { text?: unknown }).text;
			if (typeof text === 'string') chunks.push(text);
		}
	}
	return chunks.join('\n');
}

function resolvePlanningIntent(request: SimulatorRequest): SimulatorResponseIntent {
	const results = extractSimulatorToolResults(request.prompt);
	const config = request.config;
	const useChinese = containsCjk(extractSimulatorPromptText(request.prompt));

	if (
		config.scenario === 'vault-tool-recovery'
		&& !results.some((result) => result.toolName === TOOL.readNote)
	) {
			return {
				kind: 'tool-call',
				toolName: TOOL.readNote,
				input: {
					path: SIMULATOR_DEFAULTS.workflow.recoveryMissingNotePath,
					maxChars: SIMULATOR_DEFAULTS.workflow.invalidNoteMaxChars,
				},
		};
	}

	if (
		config.scenario === 'escalation-request'
		&& request.availableTools.includes(TOOL.escalate)
		&& !results.some((result) => result.toolName === TOOL.escalate)
	) {
			return {
				kind: 'tool-call',
				toolName: TOOL.escalate,
				input: { reason: SIMULATOR_DEFAULTS.fixedResponses.escalationReason },
		};
	}

	const folderList = latestResult<FolderResult>(results, TOOL.listFolders);
	if (!folderList) {
			return {
				kind: 'tool-call',
				toolName: TOOL.listFolders,
				input: { maxDepth: SIMULATOR_DEFAULTS.workflow.folderDepth },
		};
	}

	const firstFolder = folderList.folders?.find((folder) => typeof folder.path === 'string')?.path;
	if (!firstFolder) {
		return submitPlanIntent([], Number(folderList.totalMdFiles ?? 0), useChinese);
	}

	const folderRead = latestResult<ReadFolderResult>(results, TOOL.readFolder);
	if (!folderRead) {
		return {
			kind: 'tool-call',
			toolName: TOOL.readFolder,
			input: { folder: firstFolder, recursive: true },
		};
	}

	const selectedPaths = uniqueStrings(
		folderRead.files?.map((file) => file.path).filter((path): path is string => typeof path === 'string') ?? [],
	).slice(0, SIMULATOR_DEFAULTS.workflow.maxSelectedPaths);
	const firstNote = selectedPaths[0];
	const noteRead = latestResult<Record<string, unknown>>(results, TOOL.readNote);
	if (firstNote && !noteRead) {
			return {
				kind: 'tool-call',
				toolName: TOOL.readNote,
				input: { path: firstNote, maxChars: SIMULATOR_DEFAULTS.workflow.noteMaxChars },
		};
	}

	return submitPlanIntent(selectedPaths, Number(folderList.totalMdFiles ?? selectedPaths.length), useChinese);
}

function resolveOneShotIntent(request: SimulatorRequest): SimulatorResponseIntent {
	const text = extractSimulatorPromptText(request.prompt);
	const scenario = request.config.scenario;

	if (
		scenario === 'report-partial-failure'
		&& SIMULATOR_PATTERNS.partialReportSection.test(text)
	) {
		return { kind: 'error', message: SIMULATOR_DEFAULTS.errors.partialReport };
	}

	if (SIMULATOR_PATTERNS.mermaidRepair.test(text)) {
		return {
			kind: 'text',
			text: SIMULATOR_DEFAULTS.fixedResponses.mermaid,
		};
	}

	if (SIMULATOR_PATTERNS.insightAssignment.test(text)) {
		return { kind: 'text', text: SIMULATOR_DEFAULTS.fixedResponses.insightAssignment };
	}

	if (SIMULATOR_PATTERNS.summary.test(text)) {
		const copy = resolveSimulatorLanguageCopy(text);
		return {
			kind: 'text',
			text: copy.summary.join('\n\n'),
		};
	}

	if (SIMULATOR_PATTERNS.section.test(text)) {
		const copy = resolveSimulatorLanguageCopy(text);
		const title = captureSimulatorSectionTitle(text)
			?? SIMULATOR_DEFAULTS.fixedResponses.defaultSectionTitle;
		return {
			kind: 'text',
			text: [
				`${SIMULATOR_DEFAULTS.format.sectionHeadingPrefix} ${title}`,
				...copy.section,
			].join('\n\n'),
		};
	}

	if (!request.config.strict) {
		const copy = resolveSimulatorLanguageCopy(text);
		return {
			kind: 'text',
			text: copy.generic,
		};
	}

	return {
		kind: 'error',
		message: SIMULATOR_DEFAULTS.errors.strictUnmatched,
	};
}

function submitPlanIntent(
	selectedPaths: string[],
	totalMdFiles: number,
	useChinese = false,
): SimulatorResponseIntent {
	const sectionPaths = selectedPaths.length > 0 ? selectedPaths : [];
	const copy = useChinese ? SIMULATOR_DEFAULTS.copy.zh : SIMULATOR_DEFAULTS.copy.en;
	const titles = copy.titles;
	return {
		kind: 'tool-call',
		toolName: TOOL.submitPlan,
		input: {
			selected_paths: sectionPaths,
			rationale: interpolateCount(
				selectedPaths.length > 0 ? copy.rationaleSelected : copy.rationaleEmpty,
				selectedPaths.length,
			),
			proposed_outline: titles.map((title, index) => `${index + 1}. ${title}`).join('\n'),
			coverage_assessment: interpolateCount(copy.coverage, totalMdFiles),
			follow_up_questions: copy.questions,
			plan_sections: SIMULATOR_DEFAULTS.planSections.map((section, index) => ({
				id: section.id,
				title: titles[index],
				content_type: section.contentType,
				visual_type: section.visualType,
				evidence_paths: sectionPaths,
				brief: copy.briefs[index],
				weight: section.weight,
				mission_role: section.missionRole,
			})),
		},
	};
}

function latestResult<T>(results: SimulatorToolResult[], toolName: string): T | null {
	for (let i = results.length - 1; i >= 0; i -= 1) {
		if (results[i].toolName !== toolName) continue;
		return results[i].value as T;
	}
	return null;
}

function unwrapToolOutput(output: unknown): unknown {
	if (!output || typeof output !== 'object') return output;
	const typed = output as { type?: string; value?: unknown };
	if ((typed.type === 'json' || typed.type === 'text') && 'value' in typed) {
		if (typed.type === 'text' && typeof typed.value === 'string') {
			try {
				return unwrapToolOutput(JSON.parse(typed.value));
			} catch {
				return typed.value;
			}
		}
		return unwrapToolOutput(typed.value);
	}
	const envelope = output as { ok?: unknown; data?: unknown; value?: unknown };
	if (envelope.ok === true && 'data' in envelope) return unwrapToolOutput(envelope.data);
	if ('value' in envelope && Object.keys(envelope).length <= 2) return unwrapToolOutput(envelope.value);
	return output;
}

function uniqueStrings(values: string[]): string[] {
	return [...new Set(values)];
}

function interpolateCount(template: string, count: number): string {
	return template.replace('{count}', String(count));
}
