export interface GraphFullscreenQueryRoot {
	querySelector(selectors: string): unknown;
}

/**
 * Obsidian owns the modal Escape scope, while graph fullscreen is a React
 * portal outside the modal DOM. Modal hosts use this guard so an Escape that
 * belongs to the fullscreen layer cannot close the modal behind it.
 */
export function graphFullscreenOpen(root: GraphFullscreenQueryRoot): boolean {
	return Boolean(root.querySelector('.pk-graph-fullscreen-overlay'));
}
