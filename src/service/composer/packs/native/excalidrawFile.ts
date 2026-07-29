/**
 * Peak Composer — Obsidian Excalidraw (`.excalidraw.md`) structural adapter (WP8, §10.12).
 *
 * An Excalidraw note is a Markdown file whose drawing scene is stored as JSON in
 * a fenced block under a `# Drawing` / `# Excalidraw Data` marker, wrapped in a
 * `%% … %%` comment region (so the raw JSON is hidden in reading view). The
 * plugin emits two on-disk variants:
 *   - `parsed`          → a plain ```json fence with the scene object;
 *   - `compressed-json` → a ```compressed-json fence with an LZString payload.
 *
 * S4 decision (execution log §S4): we ONLY slice-replace the embedded JSON
 * region and leave the entire Markdown wrapper (frontmatter, text elements,
 * `%%` markers, the fence lines themselves) byte-for-byte untouched. Unknown
 * scene/element fields survive because we mutate the parsed object, never a
 * string. We never string-replace to guess structure (handoff §10.12).
 *
 * The `compressed-json` variant uses LZString base64. We decode it for preview
 * and encode it back after a typed patch, preserving the wrapper and fence.
 *
 * Framework-neutral: no Obsidian / DOM imports.
 */

import { compressToBase64, decompressFromBase64 } from 'lz-string';

export type ExcalidrawFenceVariant = 'parsed' | 'compressed';

export interface EmbeddedSceneLocation {
	variant: ExcalidrawFenceVariant;
	/** UTF-16 offset of the first byte of the JSON payload (just after the fence-open line). */
	jsonFrom: number;
	/**
	 * UTF-16 offset of the newline that precedes the closing ``` fence. The
	 * payload region is `[jsonFrom, jsonTo)` (JSON without its trailing newline);
	 * `raw.slice(jsonTo)` begins with `\n```` so a patch is a plain byte splice
	 * that leaves the fence + wrapper untouched.
	 */
	jsonTo: number;
}

/** A minimal shape of the parsed Excalidraw scene (unknown fields pass through). */
export interface ExcalidrawScene {
	type?: string;
	version?: number;
	source?: string;
	elements: ExcalidrawElement[];
	appState?: Record<string, unknown>;
	files?: Record<string, unknown>;
	[unknown: string]: unknown;
}

export interface ExcalidrawElement {
	id?: string;
	type: string;
	[unknown: string]: unknown;
}

export type ExcalidrawParse =
	| { ok: true; scene: ExcalidrawScene; location: EmbeddedSceneLocation }
	| { ok: false; reason: string; variant?: ExcalidrawFenceVariant };

export interface ExcalidrawPreview {
	supported: boolean;
	reason?: string;
	variant?: ExcalidrawFenceVariant;
	elementCount?: number;
	/** Element type → count (rectangle/ellipse/text/arrow/…). */
	elementTypes?: Record<string, number>;
	/** First few text-element strings, for a legible read-only summary. */
	textSample?: string[];
}

export type ExcalidrawPatch =
	| { op: 'set-background'; color: string }
	| { op: 'add-element'; element: ExcalidrawElement }
	| { op: 'remove-element'; id: string }
	| { op: 'set-scene-field'; path: Array<string | number>; value: unknown };

export type ExcalidrawPatchResult =
	| { ok: true; text: string }
	| { ok: false; reason: string; variant?: ExcalidrawFenceVariant };

const DRAWING_MARKERS = ['# Drawing', '# Excalidraw Data', '## Drawing'];

/**
 * Locate the embedded scene fence. Prefers a fence following a known drawing
 * marker; falls back to the LAST json/compressed-json fence in the file (the
 * scene is always the final data block). Returns null when no fence is present.
 */
export function locateExcalidrawScene(raw: string): EmbeddedSceneLocation | null {
	const markerIdx = firstMarkerIndex(raw);
	const searchFrom = markerIdx === -1 ? 0 : markerIdx;
	const fence = markerIdx === -1 ? findLastFence(raw) : findFenceAfter(raw, searchFrom);
	if (!fence) return null;
	return fence;
}

function firstMarkerIndex(raw: string): number {
	let best = -1;
	for (const marker of DRAWING_MARKERS) {
		const idx = raw.indexOf(marker);
		if (idx !== -1 && (best === -1 || idx < best)) best = idx;
	}
	return best;
}

const FENCE_OPEN_RE = /```(compressed-json|json)[^\n]*\n/g;

function findFenceAfter(raw: string, from: number): EmbeddedSceneLocation | null {
	FENCE_OPEN_RE.lastIndex = from;
	const match = FENCE_OPEN_RE.exec(raw);
	if (!match) return null;
	return boundsFor(raw, match);
}

function findLastFence(raw: string): EmbeddedSceneLocation | null {
	FENCE_OPEN_RE.lastIndex = 0;
	let last: RegExpExecArray | null = null;
	let m: RegExpExecArray | null;
	while ((m = FENCE_OPEN_RE.exec(raw)) !== null) last = m;
	if (!last) return null;
	return boundsFor(raw, last);
}

function boundsFor(raw: string, match: RegExpExecArray): EmbeddedSceneLocation | null {
	const variant: ExcalidrawFenceVariant = match[1] === 'compressed-json' ? 'compressed' : 'parsed';
	const jsonFrom = match.index + match[0].length;
	const closeIdx = raw.indexOf('\n```', jsonFrom);
	if (closeIdx === -1) return null;
	// jsonTo = the newline before the closing fence; `raw.slice(jsonTo)` = "\n```…".
	return { variant, jsonFrom, jsonTo: closeIdx };
}

export function parseExcalidrawScene(raw: string): ExcalidrawParse {
	const location = locateExcalidrawScene(raw);
	if (!location) return { ok: false, reason: 'No embedded Excalidraw scene found' };
	const payload = raw.slice(location.jsonFrom, location.jsonTo).trim();
	const jsonText = location.variant === 'compressed' ? decompressFromBase64(payload) : payload;
	if (!jsonText) {
		return { ok: false, variant: location.variant, reason: 'Compressed Excalidraw scene could not be decoded' };
	}
	try {
		const scene = JSON.parse(jsonText) as ExcalidrawScene;
		if (!Array.isArray(scene.elements)) scene.elements = [];
		return { ok: true, scene, location };
	} catch (err) {
		return { ok: false, variant: location.variant, reason: err instanceof Error ? err.message : 'Invalid scene JSON' };
	}
}

export function buildExcalidrawPreview(raw: string): ExcalidrawPreview {
	const parsed = parseExcalidrawScene(raw);
	if (!parsed.ok) {
		return {
			supported: false,
			...(parsed.variant !== undefined ? { variant: parsed.variant } : {}),
			reason: parsed.reason,
		};
	}
	const { scene } = parsed;
	const elementTypes: Record<string, number> = {};
	const textSample: string[] = [];
	for (const el of scene.elements) {
		elementTypes[el.type] = (elementTypes[el.type] ?? 0) + 1;
		if (el.type === 'text' && typeof el.text === 'string' && textSample.length < 6) {
			const t = el.text.trim();
			if (t) textSample.push(t.length > 60 ? `${t.slice(0, 57)}…` : t);
		}
	}
	return {
		supported: true,
		variant: parsed.location.variant,
		elementCount: scene.elements.length,
		elementTypes,
		textSample,
	};
}

/**
 * Apply typed patches by slice-replacing ONLY the embedded JSON region. The
 * frontmatter, text elements, `%%` markers and fence lines are untouched.
 */
export function applyExcalidrawPatch(raw: string, patches: readonly ExcalidrawPatch[]): ExcalidrawPatchResult {
	const parsed = parseExcalidrawScene(raw);
	if (!parsed.ok) {
		return { ok: false, reason: parsed.reason, ...(parsed.variant !== undefined ? { variant: parsed.variant } : {}) };
	}
	const { scene, location } = parsed;
	for (const patch of patches) {
		const err = applyOne(scene, patch);
		if (err) return { ok: false, reason: err, variant: 'parsed' };
	}
	const patchedJson = JSON.stringify(scene, null, '\t');
	const payload = location.variant === 'compressed' ? compressToBase64(patchedJson) : patchedJson;
	// Plain byte splice: prefix (…"```json\n") + new JSON + suffix ("\n```…%%").
	const text = raw.slice(0, location.jsonFrom) + payload + raw.slice(location.jsonTo);
	return { ok: true, text };
}

function applyOne(scene: ExcalidrawScene, patch: ExcalidrawPatch): string | null {
	switch (patch.op) {
		case 'set-background':
			scene.appState = { ...(scene.appState ?? {}), viewBackgroundColor: patch.color };
			return null;
		case 'add-element':
			if (patch.element.id && scene.elements.some((e) => e.id === patch.element.id)) {
				return `element id '${patch.element.id}' already exists`;
			}
			scene.elements.push(patch.element);
			return null;
		case 'remove-element': {
			const before = scene.elements.length;
			scene.elements = scene.elements.filter((e) => e.id !== patch.id);
			return scene.elements.length === before ? `element '${patch.id}' not found` : null;
		}
		case 'set-scene-field':
			setDeep(scene as Record<string, unknown>, patch.path, patch.value);
			return null;
	}
}

function setDeep(root: Record<string, unknown>, path: Array<string | number>, value: unknown): void {
	let cursor: Record<string, unknown> = root;
	for (let i = 0; i < path.length - 1; i++) {
		const key = String(path[i]);
		if (typeof cursor[key] !== 'object' || cursor[key] === null) cursor[key] = {};
		cursor = cursor[key] as Record<string, unknown>;
	}
	cursor[String(path[path.length - 1])] = value;
}
