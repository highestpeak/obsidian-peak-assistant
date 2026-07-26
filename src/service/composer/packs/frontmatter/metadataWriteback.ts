/**
 * Peak Composer — metadata field patch: operations, materializer, adapter (WP5).
 *
 * `metadata-field-patch` (handoff §11.4) sets ONE frontmatter field. Two entry
 * paths share the same core (`setFrontmatterField`, which preserves everything
 * else — §8.4):
 *
 *   1. DETERMINISTIC direct commit — a field candidate from the Vault property
 *      library, a custom key/value, or an accepted AI suggestion. The block UI
 *      builds ops with {@link buildMetadataFieldPatchOperations} and commits
 *      through the transaction hub (mirrors the chrome's deterministic edits).
 *   2. TYPED result pipeline — the AI property-suggestion capability streams
 *      suggestions; {@link createMetadataFieldPatchMaterializer} turns the frozen
 *      block source + the chosen field into a typed envelope, and
 *      {@link createMetadataFieldPatchWritebackAdapter} emits the one atomic
 *      block replaceRange on accept.
 *
 * Both refuse a list⇄scalar shape change silently: `requiresReview` propagates
 * so the UI must confirm it (§8.4). Framework-neutral: no `obsidian` import.
 */

import type {
	ComposerMetadataFieldPatchPayload,
	ComposerMetadataOrigin,
	ComposerMetadataValueKind,
} from '@/core/schemas/composer';
import { ComposerMetadataFieldPatchPayloadSchema } from '@/core/schemas/composer';
import type {
	ComposerDocumentSnapshot,
	ComposerOperation,
	ComposerResultEnvelope,
	ComposerTarget,
} from '@/core/composer';
import { COMPOSER_METADATA_FIELD_PATCH_WRITEBACK_ID } from '@/core/composer';
import type { ComposerResultMaterializer, MaterializeArgs } from '../../capabilities/resultMaterializers';
import type { ComposerWritebackAdapter, WritebackTargetContext } from '../../capabilities/writebackAdapters';
import { createFrontmatterBlock, setFrontmatterField, type YamlFieldSet } from './yamlWriteback';

export interface MetadataFieldPatchBuildResult {
	ok: boolean;
	operations: ComposerOperation[];
	requiresReview: boolean;
	reason?: string;
}

/**
 * Build the atomic operations that set one frontmatter field, replacing the
 * whole frontmatter block `[blockFrom, blockTo)` with the reserialized source.
 * Fails closed (no operations) when the block is malformed or has drifted.
 */
export function buildMetadataFieldPatchOperations(
	blockSource: string,
	blockFrom: number,
	blockTo: number,
	fieldSet: YamlFieldSet,
	options: { expectBaseInner?: string; flowLists?: boolean } = {},
): MetadataFieldPatchBuildResult {
	const result = setFrontmatterField(blockSource, fieldSet, options);
	if (!result.ok || result.nextBlockSource === undefined) {
		return { ok: false, operations: [], requiresReview: false, reason: result.reason };
	}
	return {
		ok: true,
		operations: [{ kind: 'replaceRange', from: blockFrom, to: blockTo, text: result.nextBlockSource }],
		requiresReview: result.requiresReview ?? false,
	};
}

// ── new-frontmatter insertion (document has no frontmatter yet) ──────────────

export interface InsertFrontmatterHeadResult {
	ok: boolean;
	operations: ComposerOperation[];
	target?: ComposerTarget;
	expectedBlockDelta: number;
	/** Reason when `ok` is false (a frontmatter block already exists). */
	reason?: string;
}

/**
 * Build the atomic operation that inserts a brand-new frontmatter block at the
 * very head of a document that has none. Frontmatter is only recognised at byte
 * 0, so the block is inserted `at: 0`; a non-empty document gets a trailing
 * blank line so the new block never fuses with the following block on reparse
 * (WP4 separator contract). Refuses (fails closed, no operations) when a
 * frontmatter block already exists — there is only ever one, at the head, and
 * per-field edits go through {@link buildMetadataFieldPatchOperations} instead.
 * Lists default to flow style (`tags: []`) so the seeded starter reads cleanly.
 */
export function buildInsertFrontmatterHeadOperations(
	snapshot: ComposerDocumentSnapshot,
	fields: readonly YamlFieldSet[],
	options: { flowLists?: boolean } = {},
): InsertFrontmatterHeadResult {
	if (snapshot.blocks.some((b) => b.kind === 'frontmatter')) {
		return { ok: false, operations: [], expectedBlockDelta: 0, reason: 'frontmatter-exists' };
	}
	const blockSource = createFrontmatterBlock(fields, options.flowLists ?? true);
	const hasBody = snapshot.sourceText.length > 0;
	const text = hasBody ? `${blockSource}\n` : blockSource;
	return {
		ok: true,
		operations: [{ kind: 'insertBlock', at: 0, text, blockKind: 'frontmatter' }],
		target: { kind: 'document', documentId: snapshot.documentId },
		expectedBlockDelta: 1,
	};
}

// ── typed pipeline (AI-suggestion → candidate → accept) ──────────────────────

/**
 * Materializer for `metadata-field-patch`. The streamed suggestion text is
 * parsed into the primary field (first suggestion); the payload carries the
 * chosen field plus the precomputed replacement block source so the writeback
 * adapter stays source-free. Full multi-suggestion parsing for the review UI is
 * {@link parseMetadataSuggestions}.
 */
export function createMetadataFieldPatchMaterializer(): ComposerResultMaterializer {
	return {
		resultKind: 'metadata-field-patch',
		materialize({ snapshot, text }: MaterializeArgs): ComposerResultEnvelope {
			const suggestions = parseMetadataSuggestions(text);
			const primary = suggestions[0];
			if (!primary) {
				throw new Error('metadata-field-patch: no field suggestion parsed from the model output');
			}
			const built = setFrontmatterField(snapshot.targetSource, { key: primary.key, value: primary.value });
			const payload: ComposerMetadataFieldPatchPayload = ComposerMetadataFieldPatchPayloadSchema.parse({
				key: primary.key,
				value: primary.value,
				valueKind: primary.valueKind,
				origin: primary.origin,
				...(primary.evidence !== undefined ? { evidence: primary.evidence } : {}),
				...(built.requiresReview ? { requiresReview: true } : {}),
			});
			return {
				resultKind: 'metadata-field-patch',
				rendererId: 'composer.renderer.metadata-suggestion',
				writebackAdapterId: COMPOSER_METADATA_FIELD_PATCH_WRITEBACK_ID,
				// The precomputed block replacement travels alongside the field payload
				// so the writeback adapter never needs the live source.
				payload: { ...payload, replacementBlockSource: built.nextBlockSource ?? snapshot.targetSource },
			};
		},
	};
}

/** Writeback adapter for `metadata-field-patch`: one atomic block replaceRange. */
export function createMetadataFieldPatchWritebackAdapter(): ComposerWritebackAdapter {
	return {
		id: COMPOSER_METADATA_FIELD_PATCH_WRITEBACK_ID,
		resultKinds: ['metadata-field-patch'],
		buildOperations(envelope, ctx: WritebackTargetContext): ComposerOperation[] {
			if (!ctx.anchor) {
				throw new Error('metadata-field-patch writeback: no frontmatter block anchor — refusing to guess');
			}
			const payload = envelope.payload as { replacementBlockSource?: string };
			if (typeof payload.replacementBlockSource !== 'string') {
				throw new Error('metadata-field-patch writeback: envelope has no precomputed block source');
			}
			return [
				{ kind: 'replaceRange', from: ctx.anchor.from, to: ctx.anchor.to, text: payload.replacementBlockSource },
			];
		},
	};
}

// ── suggestion parsing ────────────────────────────────────────────────────────

export interface MetadataSuggestion {
	key: string;
	value: string | string[];
	valueKind: ComposerMetadataValueKind;
	origin: ComposerMetadataOrigin;
	evidence?: string;
}

const SUGGESTION_LINE_RE = /^\s*(?:[-*]\s*)?([A-Za-z0-9_][A-Za-z0-9_ -]*?)\s*:\s*(.+?)\s*$/;

/**
 * Parse the model's streamed suggestion text into independent field candidates.
 * Accepted per line: `key: value` with an optional `— evidence` / `# evidence`
 * trailer, or a `[a, b]` list value. Lenient by design — malformed lines are
 * skipped, not thrown.
 */
export function parseMetadataSuggestions(text: string): MetadataSuggestion[] {
	const out: MetadataSuggestion[] = [];
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (line.length === 0) continue;
		const m = SUGGESTION_LINE_RE.exec(line);
		if (!m) continue;
		const key = m[1].trim();
		const { value, evidence } = splitValueEvidence(m[2]);
		const parsed = parseSuggestionValue(value);
		out.push({
			key,
			value: parsed.value,
			valueKind: parsed.kind,
			origin: 'ai',
			...(evidence !== undefined ? { evidence } : {}),
		});
	}
	return out;
}

function splitValueEvidence(rest: string): { value: string; evidence?: string } {
	const sep = rest.search(/\s+(?:—|--|#|·)\s+/);
	if (sep < 0) return { value: rest.trim() };
	const value = rest.slice(0, sep).trim();
	const evidence = rest.slice(sep).replace(/^\s*(?:—|--|#|·)\s+/, '').trim();
	return { value, ...(evidence.length > 0 ? { evidence } : {}) };
}

function parseSuggestionValue(raw: string): { value: string | string[]; kind: ComposerMetadataValueKind } {
	const t = raw.trim();
	const listMatch = /^\[(.*)\]$/.exec(t);
	if (listMatch) {
		const items = listMatch[1]
			.split(',')
			.map((s) => s.trim())
			.filter((s) => s.length > 0);
		return { value: items, kind: 'list' };
	}
	if (t === 'true' || t === 'false') return { value: t, kind: 'boolean' };
	return { value: t, kind: 'scalar' };
}
