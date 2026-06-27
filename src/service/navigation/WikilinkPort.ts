// T11P (Track I): Narrow port for resolving wikilink targets to vault
// paths. Lifted out of `useStreamdownWikilinkClick.ts` and the inline
// helpers in `WikilinkHoverPreview.tsx` so the Streamdown surface stops
// reaching for raw `app.metadataCache.getFirstLinkpathDest` and so the
// hover-preview / click-handler logic share a single resolver.
//
// Implementation: `src/app/navigation/AppWikilinkAdapter.ts`.
// Composition: `src/app/navigation/composeNavigation.ts`.
//
// "Opening" a wikilink reuses `VaultNavigationPort.openLink` — this port
// only owns the name → path resolution that needs the metadata cache.

export interface WikilinkPort {
	/**
	 * Resolve a "raw target" (a display name like `Note Title`, or a vault
	 * path) to a vault path via Obsidian's metadata cache. Returns null for
	 * empty/anchor-only inputs.
	 */
	resolveTarget(rawTarget: string): string | null;

	/**
	 * Resolve a streamdown wikilink href
	 * (`#peak-wikilink=…`, `peak://wikilink/…`, `obsidian://open?file=…`)
	 * to a vault path. Returns null when the href is not a wikilink or
	 * refers to a block anchor.
	 */
	resolveHref(href: string): string | null;
}
