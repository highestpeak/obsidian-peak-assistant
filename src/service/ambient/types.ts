export interface AmbientContext {
	currentParagraph: string;
	cursorSection: string;
	documentTitle: string;
	documentTags: string[];
	documentHeadings: string[];
	existingOutlinks: string[];
	recentEditDelta: string;
	editSessionDuration: number;
	filePath: string;
	lastModified: number;
}

export interface AmbientPushItem {
	filePath: string;
	title: string;
	excerpt: string;
	score: number;
	explanation: string;
	explanationType: 'template';
	signals: AmbientSignal[];
	timestamp: number;
}

export type AmbientSignal =
	| { type: 'shared_tag'; tag: string }
	| { type: 'graph_neighbor'; hop: number; via?: string }
	| { type: 'co_citation'; citingNote: string }
	| { type: 'hub_member'; hubName: string }
	| { type: 'text_overlap'; terms: string[] }
	| { type: 'recency'; editedDaysAgo: number };

export type TriggerType = 'writing_pause' | 'doc_switch' | 'manual';
export type UserAction = 'opened' | 'linked' | 'dismissed' | 'ignored';

export interface AmbientPushSettings {
	enabled: boolean;
	triggerCooldownMs: number;
	docSwitchCooldownMs: number;
	writingPauseMs: number;
	minCharDelta: number;
	maxPushItems: number;
	showStatusBar: boolean;
}

export const DEFAULT_AMBIENT_PUSH_SETTINGS: AmbientPushSettings = {
	enabled: true,
	triggerCooldownMs: 30_000,
	docSwitchCooldownMs: 5_000,
	writingPauseMs: 5_000,
	minCharDelta: 30,
	maxPushItems: 5,
	showStatusBar: true,
};
