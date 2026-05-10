/**
 * Action: Insert a wikilink into a source note's "Related" section.
 * If no ## Related section exists, appends one at the end.
 * After modification, marks the source node as structurally dirty.
 */

import type { App } from 'obsidian';
import { markStructuralDirty } from '@/service/search/index/helper/structural/orchestrator';
import { generateDocIdFromPath } from '@/core/utils/hash-utils';

export async function addLinkAction(params: {
	sourcePath: string;
	targetPath: string;
	app: App;
}): Promise<void> {
	const { sourcePath, targetPath, app } = params;
	const file = app.vault.getAbstractFileByPath(sourcePath);
	if (!file || !('extension' in file)) return;

	const content = await app.vault.read(file as any);
	const targetLink = `[[${targetPath.replace(/\.md$/, '')}]]`;

	// Check if link already exists
	if (content.includes(targetLink)) return;

	let newContent: string;
	const relatedRegex = /^## Related\b/m;
	const match = relatedRegex.exec(content);

	if (match) {
		// Find the end of the Related section (next heading or EOF)
		const sectionStart = match.index + match[0].length;
		const nextHeading = content.slice(sectionStart).search(/^\n## /m);
		const insertPos = nextHeading >= 0 ? sectionStart + nextHeading : content.length;

		// Insert the link before the next heading
		const before = content.slice(0, insertPos);
		const after = content.slice(insertPos);
		const trailingNewline = before.endsWith('\n') ? '' : '\n';
		newContent = `${before}${trailingNewline}- ${targetLink}\n${after}`;
	} else {
		// Append a Related section
		const trailingNewlines = content.endsWith('\n\n') ? '' : content.endsWith('\n') ? '\n' : '\n\n';
		newContent = `${content}${trailingNewlines}## Related\n- ${targetLink}\n`;
	}

	await app.vault.modify(file as any, newContent);

	// Mark source node dirty for incremental structural update
	const sourceNodeId = generateDocIdFromPath(sourcePath);
	await markStructuralDirty(sourceNodeId);
}
