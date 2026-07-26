/**
 * Peak Composer — native-file patch orchestrator + port (WP8, §10.12).
 *
 * The dedicated adapter that writes native objects back to their OWN file (a
 * separate `.base`/`.canvas`, or the embedded-JSON slice of an Excalidraw
 * `.excalidraw.md`). Native patches do NOT flow through the Markdown transaction
 * hub — they target a different file — so they use their own read/write port and
 * their own typed-patch functions (never string-replace, handoff §10.12).
 *
 * `patchNativeFile` is a pure text→text transform: given the current bytes and
 * typed patches, it produces the next bytes (or a fail-safe unsupported result).
 * `applyNativeFilePatch` composes it with the port for the read → patch →
 * revision-guarded write cycle the app layer drives on accept.
 */

import type { ComposerNativeFileFormat } from '@/core/schemas/composer';
import { applyBasePatch, type BaseFilePatch } from './baseFile';
import { applyCanvasPatch, type CanvasPatch } from './canvasFile';
import { applyExcalidrawPatch, type ExcalidrawPatch } from './excalidrawFile';

/** A format-tagged bundle of typed patches for one native file. */
export type NativeFilePatchRequest =
	| { format: 'base'; patches: readonly BaseFilePatch[] }
	| { format: 'canvas'; patches: readonly CanvasPatch[] }
	| { format: 'excalidraw'; patches: readonly ExcalidrawPatch[] };

export type NativeFilePatchOutcome =
	| { ok: true; nextText: string }
	| { ok: false; reason: string };

/**
 * Apply typed patches to native-file bytes. Pure and total: malformed input or
 * an unpatchable variant (compressed Excalidraw) returns `ok:false` with a
 * reason rather than throwing or corrupting the file.
 */
export function patchNativeFile(currentText: string, request: NativeFilePatchRequest): NativeFilePatchOutcome {
	try {
		if (request.format === 'base') {
			return { ok: true, nextText: applyBasePatch(currentText, request.patches) };
		}
		if (request.format === 'canvas') {
			return { ok: true, nextText: applyCanvasPatch(currentText, request.patches) };
		}
		const result = applyExcalidrawPatch(currentText, request.patches);
		return result.ok ? { ok: true, nextText: result.text } : { ok: false, reason: result.reason };
	} catch (err) {
		return { ok: false, reason: err instanceof Error ? err.message : 'native-file patch failed' };
	}
}

/**
 * Read/write bytes for a native object file. The app layer implements it over
 * the Obsidian vault (revision-guarded write); tests implement it in memory.
 * Framework-neutral — mirrors `ComposerSourcePort` / `ComposerWritePort` but for
 * arbitrary (non-Markdown) native files.
 */
export interface ComposerNativeFilePort {
	format(targetPath: string): ComposerNativeFileFormat | null;
	readNative(targetPath: string): Promise<string>;
	/**
	 * Persist `nextText`, refusing (throwing) unless the file's current bytes
	 * still equal `expectedBaseText` — a native mirror of the Markdown write guard.
	 */
	writeNative(targetPath: string, nextText: string, expectedBaseText: string): Promise<void>;
}

export type ApplyNativeFilePatchResult =
	| { ok: true }
	| { ok: false; reason: string };

/**
 * Read → typed patch → revision-guarded write for one native file. Fails closed
 * on an unpatchable variant or a concurrent external edit (the port's write
 * guard). The app layer calls this when a native candidate is accepted.
 */
export async function applyNativeFilePatch(
	port: ComposerNativeFilePort,
	targetPath: string,
	request: NativeFilePatchRequest,
): Promise<ApplyNativeFilePatchResult> {
	const current = await port.readNative(targetPath);
	const outcome = patchNativeFile(current, request);
	if (!outcome.ok) return outcome;
	if (outcome.nextText === current) return { ok: true }; // no-op patch, skip the write
	await port.writeNative(targetPath, outcome.nextText, current);
	return { ok: true };
}
