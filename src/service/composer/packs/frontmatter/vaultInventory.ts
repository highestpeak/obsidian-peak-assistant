/**
 * Peak Composer — Vault property inventory (WP5, handoff §8.2).
 *
 * The Vault-wide field/tag inventory behind the Frontmatter block's property
 * library. The vault scan itself crosses a port (`VaultPropertyScanPort`, an app
 * adapter over Obsidian's metadataCache); the STATISTICS are computed here as
 * pure functions so they are testable without Obsidian: per-field frequency,
 * observed value kinds, type conflicts, single-use (rare) fields, and which
 * common fields the current document is missing.
 *
 * Selecting a vault field, or entering a custom key/value, produces a
 * `metadata-field-patch` candidate for the CURRENT document only — never a
 * silent vault-wide write (§8.2). Framework-neutral: no `obsidian` import.
 */

import type {
	ComposerMetadataFieldPatchPayload,
	ComposerMetadataOrigin,
	ComposerMetadataValueKind,
} from '@/core/schemas/composer';
import { classifyJsValue } from './yamlModel';

/** One note's frontmatter, as read by the app adapter from the metadata cache. */
export interface VaultFrontmatterRecord {
	path: string;
	frontmatter: Record<string, unknown>;
}

/** Vault scan port — the app adapter implements it over `metadataCache`. */
export interface VaultPropertyScanPort {
	/** Every note's parsed frontmatter map. */
	scanFrontmatter(): VaultFrontmatterRecord[];
}

/** Per-field statistics across the vault. */
export interface VaultPropertyStat {
	key: string;
	/** How many notes carry the field. */
	count: number;
	/** count / total notes (0..1). */
	coverage: number;
	/** Distinct observed value kinds (a type conflict when > 1). */
	kinds: ComposerMetadataValueKind[];
	/** More than one observed value kind across the vault (§8.2 type conflict). */
	typeConflict: boolean;
	/** Field appears in exactly one note (§8.2 rare/isolated). */
	rare: boolean;
	/** Field is already present in the current document. */
	presentInCurrent: boolean;
}

export interface VaultPropertyInventory {
	totalNotes: number;
	fieldCount: number;
	tagCount: number;
	singleUseCount: number;
	typeConflictCount: number;
	/** Fields sorted by coverage desc, then key asc. */
	fields: VaultPropertyStat[];
	/** Common fields (coverage ≥ threshold) absent from the current document. */
	missingInCurrent: string[];
}

export interface VaultInventoryConfig {
	/** Key name whose list values are treated as the tag vocabulary. */
	tagFieldKey: string;
	/** Coverage (0..1) at/above which an absent field counts as "missing in current". */
	missingCoverageThreshold: number;
}

export const DEFAULT_VAULT_INVENTORY_CONFIG: VaultInventoryConfig = {
	tagFieldKey: 'tags',
	missingCoverageThreshold: 0.5,
};

/** Compute the inventory from a vault scan + the current document's frontmatter. */
export function computeVaultPropertyInventory(
	records: readonly VaultFrontmatterRecord[],
	currentFrontmatter: Record<string, unknown>,
	config: VaultInventoryConfig = DEFAULT_VAULT_INVENTORY_CONFIG,
): VaultPropertyInventory {
	const total = records.length;
	const counts = new Map<string, number>();
	const kinds = new Map<string, Set<ComposerMetadataValueKind>>();
	const tags = new Set<string>();

	for (const rec of records) {
		for (const [key, value] of Object.entries(rec.frontmatter ?? {})) {
			counts.set(key, (counts.get(key) ?? 0) + 1);
			const set = kinds.get(key) ?? new Set<ComposerMetadataValueKind>();
			set.add(inventoryKind(value));
			kinds.set(key, set);
		}
		collectTags(rec.frontmatter?.[config.tagFieldKey], tags);
	}

	const currentKeys = new Set(Object.keys(currentFrontmatter ?? {}));
	const fields: VaultPropertyStat[] = [...counts.entries()]
		.map(([key, count]) => {
			const observed = [...(kinds.get(key) ?? new Set())].sort();
			return {
				key,
				count,
				coverage: total === 0 ? 0 : count / total,
				kinds: observed,
				typeConflict: observed.length > 1,
				rare: count === 1,
				presentInCurrent: currentKeys.has(key),
			};
		})
		.sort((a, b) => (b.coverage !== a.coverage ? b.coverage - a.coverage : a.key.localeCompare(b.key)));

	const missingInCurrent = fields
		.filter((f) => !f.presentInCurrent && f.coverage >= config.missingCoverageThreshold)
		.map((f) => f.key);

	return {
		totalNotes: total,
		fieldCount: fields.length,
		tagCount: tags.size,
		singleUseCount: fields.filter((f) => f.rare).length,
		typeConflictCount: fields.filter((f) => f.typeConflict).length,
		fields,
		missingInCurrent,
	};
}

function inventoryKind(value: unknown): ComposerMetadataValueKind {
	if (Array.isArray(value)) return 'list';
	if (typeof value === 'boolean') return 'boolean';
	if (value === null || value === undefined) return 'unknown';
	return classifyJsValue(String(value));
}

function collectTags(value: unknown, out: Set<string>): void {
	if (Array.isArray(value)) {
		for (const t of value) if (t != null) out.add(String(t));
		return;
	}
	if (typeof value === 'string' && value.trim().length > 0) {
		for (const t of value.split(/[,\s]+/)) if (t) out.add(t);
	}
}

/**
 * Build a `metadata-field-patch` candidate from a selected vault field. The
 * value can be pre-filled (e.g. a template default); otherwise it is empty and
 * the user completes it before accepting. Origin reflects the field's provenance
 * in the library (human / convention / ai).
 */
export function fieldCandidateFromVault(
	stat: Pick<VaultPropertyStat, 'key'>,
	value: string | string[],
	origin: ComposerMetadataOrigin = 'human',
	evidence?: string,
): ComposerMetadataFieldPatchPayload {
	return {
		key: stat.key,
		value,
		valueKind: classifyJsValue(value),
		origin,
		...(evidence !== undefined ? { evidence } : {}),
	};
}

/** Build a `metadata-field-patch` candidate from a user-typed custom key/value (§8.2). */
export function customFieldCandidate(
	key: string,
	value: string | string[],
): ComposerMetadataFieldPatchPayload {
	return {
		key: key.trim(),
		value,
		valueKind: classifyJsValue(value),
		origin: 'human',
	};
}
