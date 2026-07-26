/**
 * Peak Composer — frontmatter property model (WP5, handoff §8.1).
 *
 * Parses a frontmatter block's verbatim source (`---\n…\n---`) into a typed
 * property model: one row per top-level field with its value KIND (scalar /
 * list / boolean / date / link / unknown) and PROVENANCE (program / human / ai /
 * convention). This is the read side that the property grid renders; the write
 * side is `yamlWriteback.ts`.
 *
 * Parser: the already-bundled `yaml` package (`parseDocument`, CST-preserving),
 * so we read robust typed values without hand-rolling a YAML tokenizer. The
 * value KIND is derived from the parsed node; PROVENANCE is inferred from the
 * configured program-field set (created/updated/… are deterministic program
 * fields — AI never impersonates them, §8.1) with everything else `human`.
 * Framework-neutral: no `obsidian` import.
 */

import { parseDocument, isSeq, isScalar, isMap, type Document } from 'yaml';
import type {
	ComposerMetadataOrigin,
	ComposerMetadataValueKind,
} from '@/core/schemas/composer';

/** One rendered frontmatter field. */
export interface FrontmatterField {
	key: string;
	/** JS value: string / string[] / boolean. `list` values are string items. */
	value: string | string[] | boolean;
	valueKind: ComposerMetadataValueKind;
	origin: ComposerMetadataOrigin;
}

export interface FrontmatterModel {
	/** Whether the source actually contained a frontmatter block. */
	present: boolean;
	fields: FrontmatterField[];
	/** True when the YAML could not be parsed (rendered verbatim upstream). */
	malformed: boolean;
}

export interface FrontmatterModelConfig {
	/** Field keys maintained by deterministic program logic (origin = program). */
	programFields: readonly string[];
}

export const DEFAULT_FRONTMATTER_MODEL_CONFIG: FrontmatterModelConfig = {
	programFields: ['created', 'updated', 'modified', 'date created', 'date modified'],
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?/;
const LINK_RE = /^(\[\[[^\]]+\]\]|https?:\/\/\S+)$/;

/** Strip the `---` fences from a frontmatter block, returning the inner YAML. */
export function stripFrontmatterFences(blockSource: string): string {
	const lines = blockSource.split('\n');
	let start = 0;
	let end = lines.length;
	if (/^---\s*$/.test(lines[0] ?? '')) start = 1;
	for (let i = lines.length - 1; i >= start; i--) {
		if (/^---\s*$/.test(lines[i])) {
			end = i;
			break;
		}
	}
	return lines.slice(start, end).join('\n');
}

/** Parse a frontmatter block source into the typed property model. */
export function parseFrontmatterModel(
	blockSource: string,
	config: FrontmatterModelConfig = DEFAULT_FRONTMATTER_MODEL_CONFIG,
): FrontmatterModel {
	const inner = stripFrontmatterFences(blockSource);
	if (inner.trim().length === 0) return { present: true, fields: [], malformed: false };
	let doc: Document.Parsed;
	try {
		doc = parseDocument(inner);
	} catch {
		return { present: true, fields: [], malformed: true };
	}
	if (doc.errors.length > 0 || !isMap(doc.contents)) {
		return { present: true, fields: [], malformed: doc.errors.length > 0 };
	}
	const programSet = new Set(config.programFields.map((f) => f.toLowerCase()));
	const fields: FrontmatterField[] = [];
	for (const item of doc.contents.items) {
		const key = String((item.key as { value?: unknown })?.value ?? item.key);
		fields.push({
			key,
			value: nodeToValue(item.value),
			valueKind: nodeToKind(item.value),
			origin: programSet.has(key.toLowerCase()) ? 'program' : 'human',
		});
	}
	return { present: true, fields, malformed: false };
}

function nodeToValue(node: unknown): string | string[] | boolean {
	if (isSeq(node)) return node.items.map((it) => String((it as { value?: unknown })?.value ?? it));
	if (isScalar(node)) {
		const v = node.value;
		if (typeof v === 'boolean') return v;
		return v === null || v === undefined ? '' : String(v);
	}
	return '';
}

/** Classify a parsed YAML value node into a display kind (handoff §8.1). */
export function nodeToKind(node: unknown): ComposerMetadataValueKind {
	if (isSeq(node)) return 'list';
	if (!isScalar(node)) return 'unknown';
	const v = node.value;
	if (typeof v === 'boolean') return 'boolean';
	if (v === null || v === undefined) return 'scalar';
	return classifyScalarString(String(v));
}

/** Classify a scalar string into date / link / scalar. Exposed for the writeback shape check. */
export function classifyScalarString(text: string): ComposerMetadataValueKind {
	const t = text.trim();
	if (DATE_RE.test(t)) return 'date';
	if (LINK_RE.test(t)) return 'link';
	return 'scalar';
}

/** Kind of an arbitrary JS value about to be written (for shape-change review). */
export function classifyJsValue(value: string | string[] | boolean): ComposerMetadataValueKind {
	if (Array.isArray(value)) return 'list';
	if (typeof value === 'boolean') return 'boolean';
	return classifyScalarString(value);
}
