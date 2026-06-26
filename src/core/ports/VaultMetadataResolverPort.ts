/**
 * Narrow port for vault link resolution. Used by the markdown loader to
 * resolve `[[wiki-link]]` text to a full vault path from the perspective
 * of a source file.
 *
 * T11K: this is split from `DocumentVaultReaderPort` so callers ask for
 * exactly the slice they need and the surface stays minimal. No other
 * Obsidian metadata cache access leaks through this port.
 */
export interface VaultMetadataResolverPort {
	/**
	 * Resolve a wikilink target relative to a source file.
	 *
	 * @param linkText The text inside `[[ ]]` (without the brackets).
	 * @param sourcePath Vault path of the file the link originates from.
	 * @returns Full vault path to the resolved file, or null if it cannot be resolved.
	 */
	resolveLinkPath(linkText: string, sourcePath: string): string | null;
}
