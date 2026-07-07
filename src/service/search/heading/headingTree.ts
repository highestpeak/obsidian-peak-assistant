/**
 * Track T2b · Heading Tree Service (stub).
 *
 * Types are locked here so T5 (Heading Mode UI) can import them
 * immediately; the implementation follows in a subsequent commit.
 */

export interface HeadingTreeNode {
	level: 1 | 2 | 3 | 4 | 5 | 6;
	title: string;
	lineStart: number;
	lineEnd: number;
	matchCount: number;
	children: HeadingTreeNode[];
	outboundLinkCount: number;
}

export interface HeadingTreeInput {
	filePath: string;
	/** Empty string ('') = empty state: full tree with all matchCount = 0. */
	queryText: string;
}

/**
 * Minimal read port: takes a vault-relative path, returns file text or null.
 *
 * Deliberately narrower than {@link DocumentVaultReaderPort} so callers can
 * inject a thin in-memory fake in tests without constructing `VaultFileRef`s.
 * App-layer wiring adapts the real vault reader to this shape.
 */
export interface HeadingFileReaderPort {
	readText(path: string): Promise<string | null>;
}

/** Optional dependency: returns incoming link source lines for a target path. */
export interface HeadingBacklinkReaderPort {
	/**
	 * Return `{ sourcePath, line }` pairs for edges that point at `targetPath`.
	 * If line-level source position is not available cheaply, the caller may
	 * return an empty array (see {@link getLinkPositions} contract).
	 */
	getBacklinkPositions(targetPath: string): Promise<Array<{ sourcePath: string; line: number }>>;
}

export interface HeadingTreeDeps {
	fileReader: HeadingFileReaderPort;
}

export interface LinkPositionsDeps {
	fileReader: HeadingFileReaderPort;
	backlinkReader?: HeadingBacklinkReaderPort;
}

export async function extractHeadingTree(
	_deps: HeadingTreeDeps,
	_input: HeadingTreeInput,
): Promise<HeadingTreeNode[]> {
	throw new Error('T2b stub');
}

export async function getLinkPositions(
	_deps: LinkPositionsDeps,
	_filePath: string,
): Promise<Array<{ line: number; target: string; kind: 'outgoing' | 'backlink' }>> {
	throw new Error('T2b stub');
}
