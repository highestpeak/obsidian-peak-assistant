import { createHash } from 'crypto';
import { SLICE_CAPS } from '@/core/constant';
import { v4 as uuidv4 } from 'uuid';

/**
 * Generate a UUID without hyphens.
 * @returns A UUID string without hyphens (e.g., "5678475e44724cb2a898c6b7046b9e1b")
 */
export function generateUuidWithoutHyphens(): string {
	// Dynamic import to avoid circular dependencies
	return uuidv4().replace(/-/g, '');
}

/**
 * Generate a stable UUID from a string (deterministic).
 * Same input always produces the same UUID.
 * @param input String to generate UUID from
 * @returns A UUID string without hyphens (e.g., "5678475e44724cb2a898c6b7046b9e1b")
 */
export function generateStableUuid(input: string): string {
	// Use MD5 hash of input to create deterministic UUID-like string
	const hash = createHash('md5').update(input).digest('hex');
	// Convert first 32 characters to UUID format: 8-4-4-4-12, then remove hyphens
	const e = SLICE_CAPS.hash.md5UuidSliceEnds;
	const uuidWithHyphens = `${hash.slice(0, e[0])}-${hash.slice(e[0], e[1])}-${hash.slice(e[1], e[2])}-${hash.slice(e[2], e[3])}-${hash.slice(e[3], e[4])}`;
	return uuidWithHyphens.replace(/-/g, '');
}

// --- Document nodes ---

/**
 * Stable document node id from vault path (deterministic).
 */
export function generateDocIdFromPath(path: string): string {
	return generateStableUuid(path ?? '');
}

/**
 * Retry seed when path-stable id collides ({@link pickDocumentNodeIdCandidate}, attempt ≥ 1).
 */
export function stableDocumentNodeIdRetrySeed(path: string, attemptIndex: number): string {
	return generateStableUuid(`${path}\0#${attemptIndex}`);
}

/**
 * Last-resort document node id when primary + retry candidates still collide (path + timestamp).
 */
export function stableDocumentNodeIdTimeFallback(path: string, timestampMs: number): string {
	return generateStableUuid(`${path}\0${timestampMs}`);
}

/**
 * Next candidate for a document node_id: attempt 0 = path-stable id, then {@link stableDocumentNodeIdRetrySeed}.
 */
export function pickDocumentNodeIdCandidate(path: string, attemptIndex: number): string {
	if (attemptIndex === 0) return generateDocIdFromPath(path);
	return stableDocumentNodeIdRetrySeed(path, attemptIndex);
}

// --- Mobius graph: folders & edges ---

/** Mobius `Folder` node id for tenant + folder path. */
export function stableMobiusFolderNodeId(tenant: string, folderPath: string): string {
	return generateStableUuid(`mobius-folder:${tenant}:${folderPath}`);
}

/** Primary key for `mobius_edge` (historical seed: concatenated ids + type, no separators). */
export function stableMobiusEdgeId(fromNodeId: string, toNodeId: string, edgeType: string): string {
	return generateStableUuid(fromNodeId + toNodeId + edgeType);
}

/**
 * Edge id for inspector / graph visualization payloads (distinct seed from {@link stableMobiusEdgeId}).
 */
export function stableGraphVisualizationEdgeId(
	fromNodeId: string,
	toNodeId: string,
	edgeType: string,
): string {
	return generateStableUuid(`${fromNodeId}-${toNodeId}-${edgeType}`);
}

// --- Mobius tag nodes ---

/** `topic_tag` node id. */
export function stableTopicTagNodeId(tag: string): string {
	return generateStableUuid(`tag:${tag}`);
}

/** `functional_tag` node id. */
export function stableFunctionalTagNodeId(tag: string): string {
	return generateStableUuid(`functional:${tag}`);
}

/** `keyword_tag` node id. */
export function stableKeywordTagNodeId(tag: string): string {
	return generateStableUuid(`keyword:${tag}`);
}

/** `context_tag` node id. */
export function stableContextTagNodeId(axis: 'time' | 'geo' | 'person', label: string): string {
	return generateStableUuid(`context:${axis}:${label}`);
}

export function stableHubClusterNodeId(tenant: string, hash: string): string {
	return generateStableUuid(`hub-cluster:${tenant}:${hash}`);
}

/**
 * Build a timestamped name with prefix and suffix.
 * Format: {prefix}-{name}-{timestamp}-{suffix}
 * @param prefix - Prefix for the name (e.g., "Project")
 * @param name - Base name
 * @param timestamp - Timestamp in milliseconds
 * @param suffix - Suffix (usually an ID)
 * @returns Formatted name string
 */
export function buildTimestampedName(prefix: string, name: string, timestamp: number, suffix: string): string {
	// Sanitize name: remove invalid characters for folder names
	const sanitizedName = name.replace(/[<>:"/\\|?*]/g, '_').trim();
	return `${prefix}-${sanitizedName}-${timestamp}-${suffix}`;
}
