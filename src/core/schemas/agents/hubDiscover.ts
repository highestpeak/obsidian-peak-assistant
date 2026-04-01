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

/** Single folder hub candidate from LLM folder-intuition or deepen rounds. */
export const folderHubCandidateSchema = z.object({
	path: z
		.string()
		.describe('Vault-relative folder path; must be grounded in tool output, not invented.'),
	label: z.string().optional().describe('Short human label for this hub (optional).'),
	confidence: z.number().describe('0..1: confidence this folder is a valid organizational folder hub.'),
	structuralRole: z
		.enum(['root_anchor', 'domain_anchor', 'subdomain_anchor', 'container_only'])
		.describe(
			'Hierarchy role: root/domain/subdomain anchor vs container_only. Map archetypes from prompts (structural parent / thematic child / parent–child coexistence) to the closest role and explain in reason.',
		),
	semanticIndexNeed: z.enum(['none', 'light', 'full']),
	reason: z
		.string()
		.describe(
			'Why this path qualifies as a folder hub: coverage, topic cohesion, non-empty container, and relationship to siblings/parent (English, concise).',
		),
	evidenceSummary: z.array(z.string()).optional(),
	possibleDocumentHubHints: z
		.array(z.string())
		.optional()
		.describe('Optional note paths to inspect later for document-level hubs (wikilink/graph anchors).'),
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
	rejectedFolders: z.array(z.object({ path: z.string(), reason: z.string() })),
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
			'All new or reaffirmed folder hubs supported by this iteration’s evidence. Submit multiple distinct paths when justified — breadth is expected; do not collapse to a single candidate unless only one folder clearly qualifies.',
		),
	rejectedFolderPaths: z.array(z.object({ path: z.string(), reason: z.string() })),
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
