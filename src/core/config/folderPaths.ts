// T11J A2: Pure folder-path helpers, framework-agnostic. The app-layer
// shim in `src/app/settings/types.ts` adds backward-compat wrappers that
// default `rootFolder` to `AppContext.getInstance().settings.ai.rootFolder`
// — those wrappers stay app-side because they reach the runtime DI
// container. Core/service callers should pass `rootFolder` explicitly.

import { BusinessError, ErrorCode } from '@/core/errors';

/** Subfolder names under rootFolder. Only rootFolder is configurable. */
export const AI_PATH_SUBFOLDERS = {
	Prompts: 'Prompts',
	CustomPrompts: 'Prompts/Custom',
	Skills: 'Skills',
	Inbox: 'Inbox',
	DataStore: 'DataStore',
	AIAnalysis: 'AI-Analysis',
	Attachments: 'Attachments',
	Media: 'Attachments/media',
	Bases: 'Bases',
	// Zero-gap Track D (2026-07-21): structured chat-artifact producer
	// destinations. Every artifact_create sub-type lands under one of these
	// subfolders so `.md` / `.excalidraw.md` / `.drawio` files stay bucketed
	// per kind and never sprawl to the Vault root.
	Artifacts: 'Artifacts',
	ArtifactsDataview: 'Artifacts/Dataview',
	ArtifactsExcalidraw: 'Artifacts/Excalidraw',
	ArtifactsDrawio: 'Artifacts/DrawIO',
	ArtifactsExtracts: 'Artifacts/Extracts',
	ArtifactsReminders: 'Artifacts/Reminders',
	ResourcesSummary: 'resources-summary-cache',
	HubSummaries: 'Hub-Summaries',
	ManualHubNotes: 'Manual',
	UserProfile: 'system/User-Profile.md',
} as const;

export const DEFAULT_AI_ROOT_FOLDER = 'ChatFolder';

/**
 * Local stand-in for Obsidian's `normalizePath`. Obsidian's version lives
 * behind the `normalizePath` side-effect symbol; importing it here would
 * register a core→obsidian side-effect edge in the boundary audit. Our
 * uses are limited to ASCII paths inside the vault, so the regex variant
 * is sufficient.
 */
function normalizePathLocal(p: string): string {
	return p.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\//, '');
}

/**
 * Resolve the canonical AI root folder, throwing if the configured value
 * is empty. Pure: callers pass `rootFolder` (typically `settings.ai.rootFolder`).
 */
export function aiNormalizedRootFolder(rootFolder: string): string {
	const trimmed = rootFolder.trim();
	if (!trimmed) {
		throw new BusinessError(ErrorCode.CONFIGURATION_MISSING, 'AI rootFolder is empty; ensure settings are initialized.');
	}
	return normalizePathLocal(trimmed.replace(/\/+$/, ''));
}

export function getAIPromptFolder(rootFolder: string): string {
	return normalizePathLocal(`${aiNormalizedRootFolder(rootFolder)}/${AI_PATH_SUBFOLDERS.Prompts}`);
}

export function getAICustomPromptsFolder(rootFolder: string): string {
	return normalizePathLocal(`${aiNormalizedRootFolder(rootFolder)}/${AI_PATH_SUBFOLDERS.CustomPrompts}`);
}

export function getAISkillsFolder(rootFolder: string): string {
	return normalizePathLocal(`${aiNormalizedRootFolder(rootFolder)}/${AI_PATH_SUBFOLDERS.Skills}`);
}

export function getAIInboxFolder(rootFolder: string): string {
	return normalizePathLocal(`${aiNormalizedRootFolder(rootFolder)}/${AI_PATH_SUBFOLDERS.Inbox}`);
}

export function getAIDataStoreFolder(rootFolder: string): string {
	return normalizePathLocal(`${aiNormalizedRootFolder(rootFolder)}/${AI_PATH_SUBFOLDERS.DataStore}`);
}

export function getAIAnalysisFolder(rootFolder: string): string {
	return normalizePathLocal(`${aiNormalizedRootFolder(rootFolder)}/${AI_PATH_SUBFOLDERS.AIAnalysis}`);
}

export function getAIUploadFolder(rootFolder: string): string {
	return normalizePathLocal(`${aiNormalizedRootFolder(rootFolder)}/${AI_PATH_SUBFOLDERS.Attachments}`);
}

/**
 * Default vault folder for media-generation attachments (TTS mp3, cover
 * images, generated videos). Users can override via
 * `settings.ai.mediaAttachmentFolder`; when unset this is the canonical
 * ChatFolder-scoped destination. Introduced in task C1 (2026-07-21).
 */
export function getAIMediaFolder(rootFolder: string): string {
	return normalizePathLocal(`${aiNormalizedRootFolder(rootFolder)}/${AI_PATH_SUBFOLDERS.Media}`);
}

/**
 * chat-unified-mode 2026-07-05 Track C follow-up: model-generated Bases
 * (`.base`) files land here so the "Save & Open in Bases" affordance
 * on ```base fenced blocks has a deterministic destination.
 */
export function getAIBasesFolder(rootFolder: string): string {
	return normalizePathLocal(`${aiNormalizedRootFolder(rootFolder)}/${AI_PATH_SUBFOLDERS.Bases}`);
}

/**
 * Zero-gap Track D (2026-07-21): destination folders for structured
 * `artifact_create` outputs. Pure resolvers — the writer picks the right
 * one based on the tool `type` and joins the filename.
 */
export function getAIArtifactsFolder(rootFolder: string): string {
	return normalizePathLocal(`${aiNormalizedRootFolder(rootFolder)}/${AI_PATH_SUBFOLDERS.Artifacts}`);
}

export function getAIArtifactsDataviewFolder(rootFolder: string): string {
	return normalizePathLocal(`${aiNormalizedRootFolder(rootFolder)}/${AI_PATH_SUBFOLDERS.ArtifactsDataview}`);
}

export function getAIArtifactsExcalidrawFolder(rootFolder: string): string {
	return normalizePathLocal(`${aiNormalizedRootFolder(rootFolder)}/${AI_PATH_SUBFOLDERS.ArtifactsExcalidraw}`);
}

export function getAIArtifactsDrawioFolder(rootFolder: string): string {
	return normalizePathLocal(`${aiNormalizedRootFolder(rootFolder)}/${AI_PATH_SUBFOLDERS.ArtifactsDrawio}`);
}

export function getAIArtifactsExtractsFolder(rootFolder: string): string {
	return normalizePathLocal(`${aiNormalizedRootFolder(rootFolder)}/${AI_PATH_SUBFOLDERS.ArtifactsExtracts}`);
}

export function getAIArtifactsRemindersFolder(rootFolder: string): string {
	return normalizePathLocal(`${aiNormalizedRootFolder(rootFolder)}/${AI_PATH_SUBFOLDERS.ArtifactsReminders}`);
}

export function getAIResourcesSummaryFolder(rootFolder: string): string {
	return normalizePathLocal(`${aiNormalizedRootFolder(rootFolder)}/${AI_PATH_SUBFOLDERS.ResourcesSummary}`);
}

export function getAIHubSummaryFolder(rootFolder: string): string {
	return normalizePathLocal(`${aiNormalizedRootFolder(rootFolder)}/${AI_PATH_SUBFOLDERS.HubSummaries}`);
}

export function getAIManualHubFolder(rootFolder: string): string {
	return normalizePathLocal(`${getAIHubSummaryFolder(rootFolder)}/${AI_PATH_SUBFOLDERS.ManualHubNotes}`);
}

export function getAIProfileFilePath(rootFolder: string): string {
	return normalizePathLocal(`${aiNormalizedRootFolder(rootFolder)}/${AI_PATH_SUBFOLDERS.UserProfile}`);
}

/**
 * Folder values that used to be the plugin defaults before the ChatFolder
 * mental model landed. Persisted settings holding one of these values must
 * be treated as unset and re-derived from `ai.rootFolder`. Users who
 * intentionally set an unrelated non-legacy path in Advanced settings keep
 * their value.
 */
export const LEGACY_FOLDER_DEFAULTS = {
	skillsFolder: new Set(['_skills']),
	inboxFolder: new Set(['_inbox']),
	customPromptsFolder: new Set(['_prompts']),
	dataStorageFolder: new Set(['A-control/PeakAssistant/DataStore']),
} as const;

export function resolveFolderSetting(
	source: unknown,
	currentDefault: string,
	legacy: ReadonlySet<string>,
): string {
	if (typeof source !== 'string') return currentDefault;
	const trimmed = source.trim();
	if (trimmed.length === 0) return currentDefault;
	return legacy.has(trimmed) ? currentDefault : source;
}
