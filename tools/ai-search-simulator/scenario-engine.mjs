import { readFileSync } from 'node:fs';

const CONFIG_PATH = new URL('./config.json', import.meta.url);
export const SIMULATOR_CONFIG = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));

const TOOL = {
	listFolders: 'mcp__vault__vault_list_folders',
	readFolder: 'mcp__vault__vault_read_folder',
	readNote: 'mcp__vault__vault_read_note',
	submitPlan: 'mcp__vault__vault_submit_plan',
	escalate: 'escalate',
};

const PATTERNS = {
	partialReportSection: new RegExp(SIMULATOR_CONFIG.patterns.partialReportSection, 'i'),
	mermaidRepair: new RegExp(SIMULATOR_CONFIG.patterns.mermaidRepair, 'i'),
	insightAssignment: new RegExp(SIMULATOR_CONFIG.patterns.insightAssignment, 'i'),
	followup: new RegExp(SIMULATOR_CONFIG.patterns.followup, 'i'),
	summary: new RegExp(SIMULATOR_CONFIG.patterns.summary, 'i'),
	section: new RegExp(SIMULATOR_CONFIG.patterns.section, 'i'),
	cjk: new RegExp(SIMULATOR_CONFIG.patterns.cjk, 'u'),
};

const DEFAULT_REQUEST_CONFIG = {
	scenario: 'happy-path',
	speed: 'normal',
	strict: true,
};

export function resolveSimulatorIntent(request) {
	const config = { ...DEFAULT_REQUEST_CONFIG, ...request.config };
	const planning = request.availableTools.includes(TOOL.submitPlan);

	if (planning && config.scenario === 'planning-failure') {
		return { kind: 'error', message: SIMULATOR_CONFIG.errors.planning };
	}

	if (planning) {
		if (config.scenario === 'empty-vault') {
			return submitPlanIntent([], 0, containsCjk(request.text));
		}
		return resolvePlanningIntent({ ...request, config });
	}

	if (config.scenario === 'report-total-failure') {
		return { kind: 'error', message: SIMULATOR_CONFIG.errors.totalReport };
	}

	return resolveOneShotIntent({ ...request, config });
}

export function simulatorConfigFromHeaders(headers) {
	const scenario = headerValue(headers, 'x-peak-simulator-scenario') ?? 'happy-path';
	const speed = headerValue(headers, 'x-peak-simulator-speed') ?? 'normal';
	const strictValue = headerValue(headers, 'x-peak-simulator-strict');
	const knownScenario = SIMULATOR_CONFIG.scenarios.some((item) => item.id === scenario);
	const knownSpeed = SIMULATOR_CONFIG.speeds.some((item) => item.id === speed);
	if (!knownScenario) throw new Error(`Unknown Simulator scenario: ${scenario}`);
	if (!knownSpeed) throw new Error(`Unknown Simulator speed: ${speed}`);
	return {
		scenario,
		speed,
		strict: strictValue == null ? true : strictValue !== 'false',
	};
}

export function simulatorDelayMs(config) {
	if (config.scenario === 'slow-streaming') return SIMULATOR_CONFIG.timing.slowMs;
	if (config.speed === 'instant') return SIMULATOR_CONFIG.timing.instantMs;
	if (config.speed === 'slow') return SIMULATOR_CONFIG.timing.slowMs;
	return SIMULATOR_CONFIG.timing.normalMs;
}

export function simulatorChunkDelayMs(delayMs) {
	if (delayMs === 0) return 0;
	return Math.max(
		SIMULATOR_CONFIG.timing.minChunkDelayMs,
		Math.floor(delayMs / SIMULATOR_CONFIG.timing.chunkDelayDivisor),
	);
}

export function splitSimulatorText(text) {
	const size = SIMULATOR_CONFIG.timing.chunkSize;
	if (text.length <= size) return [text];
	const chunks = [];
	for (let index = 0; index < text.length; index += size) {
		chunks.push(text.slice(index, index + size));
	}
	return chunks;
}

function resolvePlanningIntent(request) {
	const results = request.toolResults;
	const config = request.config;
	const useChinese = containsCjk(request.text);

	if (
		config.scenario === 'vault-tool-recovery'
		&& !results.some((result) => result.toolName === TOOL.readNote)
	) {
		return {
			kind: 'tool-call',
			toolName: TOOL.readNote,
			input: {
				path: SIMULATOR_CONFIG.workflow.recoveryMissingNotePath,
				maxChars: SIMULATOR_CONFIG.workflow.invalidNoteMaxChars,
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
			input: { reason: SIMULATOR_CONFIG.fixedResponses.escalationReason },
		};
	}

	const folderList = latestResult(results, TOOL.listFolders);
	if (!folderList) {
		return {
			kind: 'tool-call',
			toolName: TOOL.listFolders,
			input: { maxDepth: SIMULATOR_CONFIG.workflow.folderDepth },
		};
	}

	const firstFolder = folderList.folders?.find((folder) => typeof folder.path === 'string')?.path;
	if (!firstFolder) {
		return submitPlanIntent([], Number(folderList.totalMdFiles ?? 0), useChinese);
	}

	const folderRead = latestResult(results, TOOL.readFolder);
	if (!folderRead) {
		return {
			kind: 'tool-call',
			toolName: TOOL.readFolder,
			input: { folder: firstFolder, recursive: true },
		};
	}

	const selectedPaths = uniqueStrings(
		folderRead.files
			?.map((file) => file.path)
			.filter((path) => typeof path === 'string') ?? [],
	).slice(0, SIMULATOR_CONFIG.workflow.maxSelectedPaths);
	const firstNote = selectedPaths[0];
	const noteRead = latestResult(results, TOOL.readNote);
	if (firstNote && !noteRead) {
		return {
			kind: 'tool-call',
			toolName: TOOL.readNote,
			input: { path: firstNote, maxChars: SIMULATOR_CONFIG.workflow.noteMaxChars },
		};
	}

	return submitPlanIntent(
		selectedPaths,
		Number(folderList.totalMdFiles ?? selectedPaths.length),
		useChinese,
	);
}

function resolveOneShotIntent(request) {
	const { text, config } = request;
	if (
		config.scenario === 'report-partial-failure'
		&& PATTERNS.partialReportSection.test(text)
	) {
		return { kind: 'error', message: SIMULATOR_CONFIG.errors.partialReport };
	}

	if (PATTERNS.mermaidRepair.test(text)) {
		return { kind: 'text', text: SIMULATOR_CONFIG.fixedResponses.mermaid };
	}

	if (PATTERNS.insightAssignment.test(text)) {
		return { kind: 'text', text: SIMULATOR_CONFIG.fixedResponses.insightAssignment };
	}

	if (PATTERNS.followup.test(text)) {
		const copy = languageCopy(text);
		return { kind: 'text', text: copy.followup.join('\n\n') };
	}

	if (PATTERNS.summary.test(text)) {
		const copy = languageCopy(text);
		return { kind: 'text', text: copy.summary.join('\n\n') };
	}

	if (PATTERNS.section.test(text)) {
		const copy = languageCopy(text);
		const title = captureSectionTitle(text)
			?? SIMULATOR_CONFIG.fixedResponses.defaultSectionTitle;
		const sectionIndex = copy.titles.indexOf(title);
		const section = copy.sections[sectionIndex >= 0 ? sectionIndex : 0] ?? copy.sections[0];
		const evidencePaths = captureEvidencePaths(text);
		return {
			kind: 'text',
			text: [
				`${SIMULATOR_CONFIG.format.sectionHeadingPrefix} ${title}`,
				...section.map((part) => interpolateEvidence(part, evidencePaths)),
			].join('\n\n'),
		};
	}

	if (!config.strict) {
		return { kind: 'text', text: languageCopy(text).generic };
	}

	return { kind: 'error', message: SIMULATOR_CONFIG.errors.strictUnmatched };
}

function submitPlanIntent(selectedPaths, totalMdFiles, useChinese) {
	const copy = useChinese ? SIMULATOR_CONFIG.copy.zh : SIMULATOR_CONFIG.copy.en;
	const titles = copy.titles;
	return {
		kind: 'tool-call',
		toolName: TOOL.submitPlan,
		input: {
			selected_paths: selectedPaths,
			rationale: interpolateCount(
				selectedPaths.length > 0 ? copy.rationaleSelected : copy.rationaleEmpty,
				selectedPaths.length,
			),
			proposed_outline: titles.map((title, index) => `${index + 1}. ${title}`).join('\n'),
			coverage_assessment: interpolateCount(copy.coverage, totalMdFiles),
			follow_up_questions: copy.questions,
			plan_sections: SIMULATOR_CONFIG.planSections.map((section, index) => ({
				id: section.id,
				title: titles[index],
				content_type: section.contentType,
				visual_type: section.visualType,
				evidence_paths: selectedPaths,
				brief: copy.briefs[index],
				weight: section.weight,
				mission_role: section.missionRole,
			})),
		},
	};
}

function latestResult(results, toolName) {
	for (let index = results.length - 1; index >= 0; index -= 1) {
		if (results[index].toolName === toolName) return unwrapToolOutput(results[index].value);
	}
	return null;
}

function unwrapToolOutput(output) {
	if (!output || typeof output !== 'object') return parseMaybeJson(output);
	if ((output.type === 'json' || output.type === 'text') && 'value' in output) {
		return unwrapToolOutput(output.value);
	}
	if (output.ok === true && 'data' in output) return unwrapToolOutput(output.data);
	if ('value' in output && Object.keys(output).length <= 2) return unwrapToolOutput(output.value);
	return output;
}

function parseMaybeJson(value) {
	if (typeof value !== 'string') return value;
	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
}

function languageCopy(text) {
	return containsCjk(text) ? SIMULATOR_CONFIG.copy.zh : SIMULATOR_CONFIG.copy.en;
}

function containsCjk(text) {
	return PATTERNS.cjk.test(text);
}

function captureSectionTitle(text) {
	for (const label of SIMULATOR_CONFIG.patterns.sectionTitleLabels) {
		const source = SIMULATOR_CONFIG.patterns.labelValue.replace('{label}', label);
		const match = text.match(new RegExp(source, 'i'));
		if (match?.[1]) return match[1].trim();
	}
	return null;
}

function uniqueStrings(values) {
	return [...new Set(values)];
}

function captureEvidencePaths(text) {
	const paths = [];
	const pattern = /\[\[([^\]|#]+)(?:[|#][^\]]+)?\]\]/g;
	let match;
	while ((match = pattern.exec(text)) !== null) {
		const path = match[1]?.trim();
		if (path) paths.push(path);
	}
	return uniqueStrings(paths);
}

function interpolateEvidence(template, evidencePaths) {
	const first = evidencePaths[0] ?? 'Current evidence';
	const second = evidencePaths[1] ?? first;
	return template
		.replaceAll('{source1}', first)
		.replaceAll('{source2}', second);
}

function interpolateCount(template, count) {
	return template.replace('{count}', String(count));
}

function headerValue(headers, name) {
	const value = headers[name];
	if (Array.isArray(value)) return value[0];
	return typeof value === 'string' ? value : null;
}
