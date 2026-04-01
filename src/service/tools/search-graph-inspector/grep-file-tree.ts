import { getFullVaultFilePathsForGrep } from "./explore-folder";
import { matchVaultPathByGrepPattern } from "./common";

const DEFAULT_LIMIT = 200;

/**
 * Grep the vault file tree: get all paths, filter by pattern (substring or regex), return matches.
 * Used in recon anchor phase to quickly find anchor paths or directory names.
 */
export async function grepFileTree(params: {
	pattern: string;
	limit?: number | null;
}): Promise<string> {
	const limit = Math.min(DEFAULT_LIMIT, Math.max(1, Number(params.limit) ?? DEFAULT_LIMIT));
	const pattern = String(params.pattern).trim();
	const allPaths = getFullVaultFilePathsForGrep();

	const matched = allPaths.filter((p) => matchVaultPathByGrepPattern(p, pattern));

	const slice = matched.slice(0, limit);
	const total = matched.length;
	const lines = slice.map((p) => `- ${p}`);
	const header = [
		"## grep_file_tree",
		"",
		`Pattern: \`${pattern}\``,
		`Matches: ${slice.length}${total > limit ? ` (showing first ${limit} of ${total})` : ""}`,
		"",
	].join("\n");
	return header + lines.join("\n");
}
