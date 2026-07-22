/**
 * artifactMediaUri — pure helpers for turning a ChatArtifactReceipt's
 * persisted media reference into something the DOM can load.
 *
 * Why this exists (D1 review C1):
 *   ArtifactReceipt.preview.uri is DURABLE: for locally-generated media it is
 *   stored as a vault-relative path (e.g. `ChatFolder/Attachments/media/foo.png`).
 *   That path cannot be handed to `<img src>` directly — the browser has no
 *   idea how to fetch it. Obsidian exposes `app.vault.getResourcePath()` which
 *   returns a session-scoped `app://…` URL that IS loadable, but that URL is
 *   NOT safe to persist (it changes across app sessions / vault mounts and
 *   would go stale). The correct discipline is therefore:
 *
 *     • persistence layer: keep the vault path (already done)
 *     • render layer: convert vault path → `app://…` at DISPLAY time only
 *
 * This module isolates the conversion logic so it can be unit-tested without
 * pulling in React or the VaultPreviewPort. Callers pass a resolver function
 * (obtained from `useServiceContext().vaultPreview.getResourcePath` in
 * production) and get back a URL usable in `<img src>` / `<video src>` / etc.
 */

import type { ChatArtifactReceipt } from '@/core/types/chat-studio';

/** Resolver used to turn a vault-relative path into a session-scoped URL. */
export type VaultPathResolver = (vaultPath: string) => string | null;

/** Detects URIs that already carry a scheme the browser can load directly. */
export function hasLoadableScheme(uri: string): boolean {
	// Match `scheme:` prefix. Keep the check narrow to schemes we actually
	// expect: `app:` (Obsidian resource URL), `data:` (inline), `blob:` (
	// object URL), `http:` / `https:` (remote / provider-returned), `file:`
	// (native), plus a permissive fallback for any well-formed scheme so a
	// future provider return-URL (e.g. `s3:`) is not misidentified as a
	// vault path.
	return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(uri);
}

/**
 * Pick the raw media reference off a receipt. Kept as a separate step so
 * layout-decision code (`getArtifactReceiptLayout`) can consult it without
 * committing to a render URL.
 */
export function pickReceiptMediaUri(receipt: ChatArtifactReceipt): string | undefined {
	return receipt.preview?.uri ?? receipt.externalUri ?? receipt.uri;
}

/**
 * Resolve a receipt's media URI to a value safe to hand to a browser
 * element. Contract:
 *   • No raw URI on the receipt → `undefined` (caller decides whether to
 *     fall back to a placeholder or hide the preview).
 *   • URI already carries a scheme (http/https/data/blob/app/…) → returned
 *     verbatim.
 *   • Bare path (no scheme) → treated as vault path and passed through the
 *     resolver. If the resolver returns `null` (unknown file), the
 *     resolution fails and `undefined` is returned; we do NOT synthesize a
 *     path that would give a broken `<img>` request.
 */
export function resolveArtifactMediaUri(
	receipt: ChatArtifactReceipt,
	resolveVaultPath: VaultPathResolver,
): string | undefined {
	const raw = pickReceiptMediaUri(receipt);
	if (!raw) return undefined;
	if (hasLoadableScheme(raw)) return raw;
	// Normalise leading slash — vault paths do not carry one, but downstream
	// receipt writers occasionally include it and Obsidian's lookup is
	// leading-slash-sensitive.
	const normalized = raw.startsWith('/') ? raw.slice(1) : raw;
	const resolved = resolveVaultPath(normalized);
	return resolved ?? undefined;
}
