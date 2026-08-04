// T11I (2026-06-26): framework-agnostic V2 tool/timeline/source types.
// Display helpers (v2ToolDisplay/extractV2Summary/unwrapToolOutput) live in
// src/service/search/v2ToolDisplay.ts (icon/label strings are display data,
// not type data, and belong next to the search service that produces them).

export type V2TimelineItem =
	| { kind: 'text'; id: string; text: string; complete: boolean }
	| { kind: 'tool'; step: V2ToolStep };

export interface V2Source {
	path: string;
	title: string;
	/** Agent evidence-read timestamp. Never present this as the Vault file modification time. */
	readAt: number;
	reasoning?: string;
}

export interface V2ToolStep {
	id: string;
	toolName: string;
	displayName: string;
	icon: string;
	input: Record<string, unknown>;
	status: 'running' | 'done' | 'error';
	startedAt: number;
	endedAt?: number;
	summary?: string;
	resultPreview?: string;
}
