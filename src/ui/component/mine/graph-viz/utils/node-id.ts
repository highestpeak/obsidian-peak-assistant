/**
 * Node ID utilities for graph visualization.
 * Generic: no built-in prefixes. Use createCleanNodeId for custom normalization.
 */

/**
 * Factory for a node ID normalizer that removes given prefixes and optionally lowercases certain prefixes.
 */
export function createCleanNodeId(
	prefixes: string[],
	lowerCasePrefixes?: string[]
): (nodeId: string) => string {
	return (nodeId: string) => {
		if (!nodeId) return nodeId;

		let cleaned = nodeId;
		for (const prefix of prefixes) {
			if (cleaned.startsWith(prefix)) {
				cleaned = cleaned.substring(prefix.length);
				break;
			}
		}

		if (lowerCasePrefixes?.length) {
			for (const lp of lowerCasePrefixes) {
				if (cleaned.startsWith(lp)) {
					return cleaned.toLowerCase();
				}
			}
		}

		return cleaned;
	};
}
