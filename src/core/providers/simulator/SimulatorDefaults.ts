/**
 * Compiled Simulator defaults.
 *
 * Canonical configurable copy and timing knobs live in
 * `templates/config/ai-search-simulator.json`. This module gives the
 * synchronous provider adapter a typed, bundled view of that template; no
 * scenario strings or latency constants are scattered through runtime logic.
 */

import rawDefaults from '../../../../templates/config/ai-search-simulator.json';
import type {
	SimulatorProfileConfig,
	SimulatorScenarioId,
	SimulatorSpeed,
} from '@/core/profiles/types';

interface SimulatorLanguageCopy {
	titles: [string, string, string];
	rationaleSelected: string;
	rationaleEmpty: string;
	coverage: string;
	questions: [string, string, string];
	briefs: [string, string, string];
	summary: string[];
	section: string[];
	generic: string;
}

interface SimulatorDefaults {
	timing: {
		instantMs: number;
		normalMs: number;
		slowMs: number;
		chunkSize: number;
		minChunkDelayMs: number;
		chunkDelayDivisor: number;
	};
	workflow: {
		folderDepth: number;
		noteMaxChars: number;
		invalidNoteMaxChars: number;
		maxSelectedPaths: number;
		recoveryMissingNotePath: string;
	};
	usage: {
		inputTokens: number;
		outputTokens: number;
	};
	format: {
		sectionHeadingPrefix: string;
	};
	ui: {
		providerName: string;
		providerLabel: string;
		providerDescription: string;
		presetDescription: string;
		credentialLabel: string;
		sectionTitle: string;
		scenarioLabel: string;
		speedLabel: string;
		strictLabel: string;
		instruction: string;
	};
	planSections: Array<{
		id: string;
		contentType: string;
		visualType: string;
		weight: number;
		missionRole: string;
	}>;
	patterns: {
		partialReportSection: string;
		mermaidRepair: string;
		insightAssignment: string;
		summary: string;
		section: string;
		cjk: string;
		sectionTitleLabels: string[];
		labelValue: string;
	};
	scenarios: Array<{
		id: SimulatorScenarioId;
		label: string;
		description: string;
	}>;
	speeds: Array<{
		id: SimulatorSpeed;
		label: string;
		description: string;
	}>;
	errors: {
		planning: string;
		partialReport: string;
		totalReport: string;
		strictUnmatched: string;
		unsupportedSdkTool: string;
		aborted: string;
	};
	fixedResponses: {
		mermaid: string;
		insightAssignment: string;
		defaultSectionTitle: string;
		escalationReason: string;
	};
	copy: {
		en: SimulatorLanguageCopy;
		zh: SimulatorLanguageCopy;
	};
}

export const SIMULATOR_DEFAULTS = rawDefaults as SimulatorDefaults;
export const SIMULATOR_PATTERNS = {
	partialReportSection: new RegExp(SIMULATOR_DEFAULTS.patterns.partialReportSection, 'i'),
	mermaidRepair: new RegExp(SIMULATOR_DEFAULTS.patterns.mermaidRepair, 'i'),
	insightAssignment: new RegExp(SIMULATOR_DEFAULTS.patterns.insightAssignment, 'i'),
	summary: new RegExp(SIMULATOR_DEFAULTS.patterns.summary, 'i'),
	section: new RegExp(SIMULATOR_DEFAULTS.patterns.section, 'i'),
	cjk: new RegExp(SIMULATOR_DEFAULTS.patterns.cjk, 'u'),
};

export function resolveSimulatorLanguageCopy(text: string): SimulatorLanguageCopy {
	return containsCjk(text) ? SIMULATOR_DEFAULTS.copy.zh : SIMULATOR_DEFAULTS.copy.en;
}

export function resolveSimulatorDelay(config: SimulatorProfileConfig): number {
	if (config.scenario === 'slow-streaming') return SIMULATOR_DEFAULTS.timing.slowMs;
	if (config.speed === 'instant') return SIMULATOR_DEFAULTS.timing.instantMs;
	if (config.speed === 'slow') return SIMULATOR_DEFAULTS.timing.slowMs;
	return SIMULATOR_DEFAULTS.timing.normalMs;
}

export function resolveSimulatorChunkDelay(delayMs: number): number {
	if (delayMs === 0) return 0;
	return Math.max(
		SIMULATOR_DEFAULTS.timing.minChunkDelayMs,
		Math.floor(delayMs / SIMULATOR_DEFAULTS.timing.chunkDelayDivisor),
	);
}

export function splitSimulatorText(text: string): string[] {
	const size = SIMULATOR_DEFAULTS.timing.chunkSize;
	if (text.length <= size) return [text];
	const chunks: string[] = [];
	for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
	return chunks;
}

export function containsCjk(text: string): boolean {
	return SIMULATOR_PATTERNS.cjk.test(text);
}

export function captureSimulatorSectionTitle(text: string): string | null {
	for (const label of SIMULATOR_DEFAULTS.patterns.sectionTitleLabels) {
		const source = SIMULATOR_DEFAULTS.patterns.labelValue.replace('{label}', label);
		const match = text.match(new RegExp(source, 'i'));
		if (match?.[1]) return match[1].trim();
	}
	return null;
}
