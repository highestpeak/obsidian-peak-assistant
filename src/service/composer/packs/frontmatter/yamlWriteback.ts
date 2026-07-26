/**
 * Peak Composer — frontmatter YAML writeback (WP5, handoff §8.4).
 *
 * Sets ONE frontmatter field while preserving unknown fields, key order and any
 * retainable comments/format — the `yaml` package's `parseDocument` keeps the
 * document's CST, so untouched keys, their comments and their formatting survive
 * a `doc.set(key, value)` + `toString()` round-trip. Only the target field is
 * mutated (§8.4). Two safety rules are enforced here:
 *
 *   - a list⇄scalar shape change is flagged `requiresReview` so accepting one
 *     can never silently rewrite the field's shape (§8.4);
 *   - `expectBaseInner` (the frozen inner-YAML at candidate time) lets the
 *     caller refuse a stale write; the transaction hub's revision guard is the
 *     outer defense, this is the field-local one.
 *
 * Output is the FULL replacement block source (`---\n…\n---`) so the writeback
 * adapter compiles it into a single atomic block replaceRange.
 */

import { parseDocument, YAMLSeq, isMap, type Document } from 'yaml';
import { classifyJsValue, nodeToKind, stripFrontmatterFences } from './yamlModel';

export interface YamlFieldSet {
	key: string;
	value: string | string[] | boolean;
}

export interface YamlWritebackResult {
	ok: boolean;
	/** Full `---\n…\n---` replacement for the frontmatter block (present when ok). */
	nextBlockSource?: string;
	/** True when accepting would change the field's YAML shape (list⇄scalar). */
	requiresReview?: boolean;
	/** Reason when `ok` is false (stale / malformed). */
	reason?: string;
}

export interface YamlWritebackOptions {
	/** Frozen inner-YAML at candidate time; a mismatch means the source drifted. */
	expectBaseInner?: string;
	/** Prefer flow style (`[a, b]`) for newly written lists. Default: block style. */
	flowLists?: boolean;
}

const FENCE = '---';

/** Detect the fence/newline framing of a block so we can reproduce it exactly. */
function frame(blockSource: string): { openFence: string; trailingNewline: boolean } {
	const openFence = /^---\s*(\r?\n)/.exec(blockSource)?.[0] ?? `${FENCE}\n`;
	return { openFence, trailingNewline: blockSource.endsWith('\n') };
}

/** Set (or add) one top-level frontmatter field, preserving everything else. */
export function setFrontmatterField(
	blockSource: string,
	set: YamlFieldSet,
	options: YamlWritebackOptions = {},
): YamlWritebackResult {
	const inner = stripFrontmatterFences(blockSource);
	if (options.expectBaseInner !== undefined && options.expectBaseInner !== inner) {
		return { ok: false, reason: 'stale' };
	}
	let doc: Document.Parsed;
	try {
		doc = parseDocument(inner);
	} catch {
		return { ok: false, reason: 'malformed' };
	}
	if (doc.errors.length > 0 || (doc.contents !== null && !isMap(doc.contents))) {
		return { ok: false, reason: 'malformed' };
	}
	const existing = doc.get(set.key, true);
	const requiresReview = existing != null && isListKind(nodeToKind(existing)) !== Array.isArray(set.value);

	doc.set(set.key, toNode(set.value, options.flowLists ?? false));
	const nextInner = doc.toString({ flowCollectionPadding: false, lineWidth: 0 }).replace(/\n+$/, '\n');
	const nextBlockSource = reframe(blockSource, nextInner);
	return { ok: true, nextBlockSource, ...(requiresReview ? { requiresReview: true } : {}) };
}

/** Build a fresh frontmatter block from an ordered field list (no block exists yet). */
export function createFrontmatterBlock(fields: readonly YamlFieldSet[], flowLists = false): string {
	const doc = parseDocument('');
	for (const f of fields) doc.set(f.key, toNode(f.value, flowLists));
	const inner = doc.toString({ flowCollectionPadding: false, lineWidth: 0 }).replace(/\n+$/, '\n');
	return `${FENCE}\n${inner}${FENCE}\n`;
}

function toNode(value: string | string[] | boolean, flow: boolean): unknown {
	if (!Array.isArray(value)) return value;
	const seq = new YAMLSeq();
	for (const item of value) seq.add(item);
	seq.flow = flow;
	return seq;
}

function isListKind(kind: string): boolean {
	return kind === 'list';
}

/** Re-wrap new inner YAML in the original block's fence framing. */
function reframe(originalBlock: string, nextInner: string): string {
	const { openFence, trailingNewline } = frame(originalBlock);
	const body = nextInner.endsWith('\n') ? nextInner : `${nextInner}\n`;
	const close = `${FENCE}${trailingNewline ? '\n' : ''}`;
	return `${openFence}${body}${close}`;
}
