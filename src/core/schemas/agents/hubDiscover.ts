import { z } from 'zod/v3';

/**
 * Hub-related Zod schemas: semantic merge, HubDoc LLM output, HubDiscoveryAgent folder rounds.
 * (Whole-round review / assembly-hints batch schemas were removed — unused in codebase.)
 */

// --- Semantic hub merge (post-selection, non-manual hubs only) ---

const hubSemanticMergeRiskSchema = z.enum(['cross_source_kind', 'broad_folder_center', 'disconnected_graph']);

/** One merge group: absorbed hubs fold into an existing representative `stableKey`. */
export const hubSemanticMergeGroupLlmSchema = z.object({
	representativeStableKey: z
		.string()
		.max(512)
		.describe(
			'Must be one of memberStableKeys (kind-prefixed normalized vault paths from input cards, not raw node ids)',
		),
	memberStableKeys: z
		.array(z.string().max(512))
		.min(2)
		.max(24)
		.describe('Keys to merge exactly as in input hub cards; must exist in input'),
	reason: z.string().max(800).describe('Short English rationale'),
	confidence: z.number().min(0).max(1).describe('Confidence that merge is correct'),
	mergeKind: z.enum(['duplicate', 'alias', 'same_topic']).describe('Why these are one hub'),
	risks: z.array(hubSemanticMergeRiskSchema).max(8).optional(),
});

/** Structured output for LLM semantic hub merge after discovery selection. */
export const hubSemanticMergeLlmSchema = z.object({
	mergeGroups: z.array(hubSemanticMergeGroupLlmSchema).max(80),
});

export type HubSemanticMergeLlm = z.infer<typeof hubSemanticMergeLlmSchema>;
export type HubSemanticMergeGroupLlm = z.infer<typeof hubSemanticMergeGroupLlmSchema>;

// --- HubDoc summary fill (materialized hub notes) ---

/** Zod schema for hub-doc-summary prompt structured output (AI SDK `streamObject`). */
export const hubDocSummaryLlmSchema = z
	.object({
		title: z.string().max(200).optional(),
		shortSummary: z.string(),
		fullSummary: z.string(),
		coreFacts: z.array(z.string()).default([]),
		queryAnchors: z.array(z.string()).default([]),
		tagTopicDistribution: z.string(),
		timeDimension: z.string(),
		keyPatterns: z.string().optional(),
	})
	.refine((d) => d.shortSummary.trim().length > 0 || d.fullSummary.trim().length > 0, {
		message: 'At least one of shortSummary or fullSummary must be non-empty',
	});

export type HubDocSummaryLlm = z.infer<typeof hubDocSummaryLlmSchema>;

// --- HubDiscoveryAgent folder rounds ---

/** Where navigation should land relative to this folder path. */
export const folderHubLandingLevelSchema = z.enum(['here', 'both']);

/** Optional standardized category for rejected folder paths. */
export const folderHubRejectionKindSchema = z.enum([
	'container_only',
	'weak_theme',
	'noisy_mixed',
	'redundant_with_child',
	'redundant_with_parent',
	'insufficient_evidence',
]);

/** One rejected folder path (deepen round or recon submit). */
export const rejectedFolderPathEntrySchema = z.object({
	path: z.string(),
	reason: z.string(),
	rejectionKind: folderHubRejectionKindSchema.optional().describe(
		'Optional machine-readable rejection category; use especially for container-like or weak-theme drops.',
	),
});

export type RejectedFolderPathEntry = z.infer<typeof rejectedFolderPathEntrySchema>;
export type FolderHubLandingLevel = z.infer<typeof folderHubLandingLevelSchema>;
export type FolderHubRejectionKind = z.infer<typeof folderHubRejectionKindSchema>;

/** Group kind for folders that are weak alone but useful together for navigation. */
export const folderNavigationGroupKindSchema = z.enum(['parallel_roots', 'sibling_set', 'small_topic_bundle']);

/** Final navigation group composed of multiple related folders. */
export const folderNavigationGroupSchema = z.object({
	label: z.string().describe('Short human label for the navigation group.'),
	memberPaths: z
		.array(z.string())
		.min(2)
		.describe('Vault-relative folder paths that together form one navigation group.'),
	confidence: z.number().describe('0..1: confidence this folder group is useful for navigation.'),
	reason: z.string().describe('Why these folders should be navigated as one group (English, concise).'),
	groupKind: folderNavigationGroupKindSchema
		.optional()
		.describe('Optional machine-readable group kind for parallel roots or small sibling bundles.'),
});

export type FolderNavigationGroup = z.infer<typeof folderNavigationGroupSchema>;

/** Single folder hub candidate from LLM folder-intuition or deepen rounds. */
export const folderHubCandidateSchema = z.object({
	path: z
		.string()
		.describe('Vault-relative folder path; must be grounded in tool output, not invented.'),
	label: z.string().optional().describe('Short human label for this hub (optional).'),
	confidence: z.number().describe('0..1: confidence this folder is a valid organizational folder hub.'),
	landingLevel: folderHubLandingLevelSchema.describe(
		'here: this folder is the best hub landing point; both: this folder and a deeper subfolder both have independent hub value.',
	),
	reason: z
		.string()
		.describe(
			'Why this path qualifies as a folder hub: coverage, topic cohesion, and landing decision vs siblings/parent (English, concise).',
		),
	evidenceSummary: z.array(z.string()).optional(),
});

/** Coverage / stop hints after a folder round. */
export const coverageAssessmentSchema = z.object({
	coveredRootPaths: z.array(z.string()),
	coveredThemes: z.array(z.string()),
	missingThemes: z.array(z.string()),
	weakBranches: z.array(z.string()).optional(),
	messyBranches: z.array(z.string()).optional(),
	orphanRiskLevel: z.enum(['low', 'medium', 'high']),
	globalPictureSufficient: z.boolean(),
});

/** One `explore_folder` task proposed by the folder-intuition round. */
export const exploreFolderTaskSchema = z.object({
	path: z.string(),
	goal: z.enum([
		'clarify_boundary',
		'find_subhubs',
		'find_doc_bridges',
		'validate_noise',
		'estimate_semantic_need',
	]),
	reason: z.string(),
});

/** Lead for discovering document-level hubs (bridges / index / authority notes). */
export const documentHubLeadSchema = z.object({
	sourceFolderPath: z.string(),
	targetPathPrefix: z.string().optional(),
	goal: z.enum(['find_cross_folder_bridge', 'find_index_note', 'find_authority_note']),
	expectedRole: z.enum(['bridge', 'index', 'authority']),
	reason: z.string(),
});

export const ignoredFolderEntrySchema = z.object({
	path: z.string(),
	reason: z.string(),
});

/** Structured output: one page of compact folder tree → intuition. */
export const folderIntuitionRoundSchema = z.object({
	folderHubCandidates: z.array(folderHubCandidateSchema),
	exploreFolderTasks: z.array(exploreFolderTaskSchema),
	documentHubLeads: z.array(documentHubLeadSchema),
	ignoredFolders: z.array(ignoredFolderEntrySchema).optional(),
	coverageAssessment: coverageAssessmentSchema,
	findingsSummary: z.string(),
});

/** Structured output: after explore_folder dossiers, refine candidates. */
export const folderDeepenRoundSchema = z.object({
	confirmedFolderHubCandidates: z.array(folderHubCandidateSchema),
	folderNavigationGroups: z.array(folderNavigationGroupSchema).optional(),
	rejectedFolders: z.array(rejectedFolderPathEntrySchema),
	refinedDocumentHubLeads: z.array(documentHubLeadSchema),
	updatedCoverage: coverageAssessmentSchema,
	findingsSummary: z.string(),
});

export type FolderHubCandidate = z.infer<typeof folderHubCandidateSchema>;
export type CoverageAssessment = z.infer<typeof coverageAssessmentSchema>;
export type ExploreFolderTask = z.infer<typeof exploreFolderTaskSchema>;
export type DocumentHubLead = z.infer<typeof documentHubLeadSchema>;
export type IgnoredFolderEntry = z.infer<typeof ignoredFolderEntrySchema>;
export type FolderIntuitionRoundOutput = z.infer<typeof folderIntuitionRoundSchema>;
export type FolderDeepenRoundOutput = z.infer<typeof folderDeepenRoundSchema>;

// --- HubDiscoveryAgent manual recon (plan/tool/submit loops) ---

/** Folder that looks like a cross-cutting corridor rather than a cohesive theme hub. */
export const highwayFolderLeadSchema = z.object({
	path: z.string(),
	reason: z.string(),
	signal: z.enum(['high_outgoing', 'cross_boundary', 'mixed_topics', 'bridge_corridor']),
	confidence: z.number(),
});

export type HighwayFolderLead = z.infer<typeof highwayFolderLeadSchema>;

/** After each folder-hub recon iteration: merge memory + coverage. */
export const hubDiscoveryFolderReconSubmitSchema = z.object({
	findingsSummary: z
		.string()
		.describe('Short iteration summary: evidence gathered, new confirmations/rejections, remaining gaps.'),
	confirmedFolderHubCandidates: z
		.array(folderHubCandidateSchema)
		.describe(
			'All new or reaffirmed final folder hubs supported by this iteration’s evidence. Do not include broad branches whose actual landing point is deeper.',
		),
	folderNavigationGroups: z
		.array(folderNavigationGroupSchema)
		.describe('Optional navigation groups for parallel roots or small same-level folders that are more useful together than alone.'),
	rejectedFolderPaths: z.array(rejectedFolderPathEntrySchema),
	highwayFolderLeads: z.array(highwayFolderLeadSchema),
	ignoredPathPrefixes: z.array(z.string()),
	updatedCoverage: coverageAssessmentSchema,
	openQuestions: z.array(z.string()).optional(),
	should_stop: z
		.boolean()
		.describe('True when coverage is sufficient or further tool rounds are unlikely to add value.'),
});

export type HubDiscoveryFolderReconSubmit = z.infer<typeof hubDiscoveryFolderReconSubmitSchema>;

export const confirmedDocumentHubPathSchema = z.object({
	path: z.string(),
	role: z.enum(['bridge', 'index', 'authority']),
	reason: z.string(),
	confidence: z.number(),
});

export type ConfirmedDocumentHubPath = z.infer<typeof confirmedDocumentHubPathSchema>;

/** After each document-hub recon iteration. */
export const hubDiscoveryDocumentReconSubmitSchema = z.object({
	findingsSummary: z.string(),
	refinedDocumentHubLeads: z.array(documentHubLeadSchema),
	confirmedDocumentHubPaths: z.array(confirmedDocumentHubPathSchema),
	rejectedSeeds: z.array(z.object({ path: z.string(), reason: z.string() })),
	openQuestions: z.array(z.string()).optional(),
	should_stop: z.boolean(),
});

export type HubDiscoveryDocumentReconSubmit = z.infer<typeof hubDiscoveryDocumentReconSubmitSchema>;
