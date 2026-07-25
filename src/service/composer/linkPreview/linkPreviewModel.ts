/**
 * Peak Composer — link hover preview model (WP4, §7.7).
 *
 * Resolves a link token into the data the hover popover renders: a vault note
 * (title / path / summary + open-and-locate), an external URL (domain / full
 * URL + open), or a broken link (repair suggestions that never block viewing
 * the raw target). Vault metadata comes through a port the app layer backs with
 * Obsidian's metadata cache; the model itself is pure and node-testable.
 */

export type ComposerLinkKind = 'vault' | 'external' | 'broken';

export interface VaultLinkMeta {
	path: string;
	title: string;
	summary?: string;
	exists: boolean;
}

/** App-implemented metadata source (Obsidian metadata cache adapter / test fake). */
export interface ComposerLinkMetadataPort {
	/** Resolve an internal wikilink/target to a vault note, or null if unresolved. */
	resolveVaultLink(target: string, sourcePath: string): VaultLinkMeta | null;
	/** Repair candidates for a broken internal link (fuzzy path matches). */
	suggestForBroken(target: string, sourcePath: string): string[];
}

export interface ComposerLinkPreview {
	kind: ComposerLinkKind;
	/** Raw target as written (`[[知识库]]` target / `https://…`). */
	target: string;
	// vault
	path?: string;
	title?: string;
	summary?: string;
	// external
	domain?: string;
	url?: string;
	// broken
	suggestions?: string[];
}

const EXTERNAL_RE = /^[a-z][a-z0-9+.-]*:\/\//i;

/** Build the preview for a link token. `sourcePath` is the document holding it. */
export function buildLinkPreview(
	rawTarget: string,
	sourcePath: string,
	port: ComposerLinkMetadataPort,
): ComposerLinkPreview {
	const target = rawTarget.trim();
	if (EXTERNAL_RE.test(target)) return externalPreview(target);

	const meta = port.resolveVaultLink(target, sourcePath);
	if (meta && meta.exists) {
		return {
			kind: 'vault',
			target,
			path: meta.path,
			title: meta.title || target,
			summary: meta.summary,
		};
	}
	return { kind: 'broken', target, suggestions: port.suggestForBroken(target, sourcePath) };
}

function externalPreview(target: string): ComposerLinkPreview {
	let domain = target;
	let url = target;
	try {
		const parsed = new URL(target);
		domain = parsed.hostname;
		url = parsed.href;
	} catch {
		// Keep the raw target; still show it as external so the user can view it.
	}
	return { kind: 'external', target, domain, url };
}
