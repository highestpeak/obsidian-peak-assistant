/**
 * Action: Create a bridge note connecting two communities.
 * Uses the bridge-note-template.hbs for content generation.
 * Creates the file in vault root and opens it.
 */

import type { App, TFile } from 'obsidian';
import type { StructuralHole } from '@/service/search/index/helper/structural/types';

export async function createBridgeNoteAction(params: {
	gap: StructuralHole;
	app: App;
}): Promise<TFile | null> {
	const { gap, app } = params;
	const { communityA, communityB } = gap;

	// Generate filename
	const safeLabelA = communityA.label.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '-').slice(0, 30);
	const safeLabelB = communityB.label.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '-').slice(0, 30);
	const filename = `Bridge - ${safeLabelA} x ${safeLabelB}.md`;

	// Check if file already exists
	const existing = app.vault.getAbstractFileByPath(filename);
	if (existing) {
		// Open existing file
		const leaf = app.workspace.getLeaf();
		await leaf.openFile(existing as TFile);
		return existing as TFile;
	}

	// Build content from template data
	const topNodesA = communityA.topNodes
		.slice(0, 5)
		.map(n => `- [[${n.path.replace(/\.md$/, '')}]]`)
		.join('\n');
	const topNodesB = communityB.topNodes
		.slice(0, 5)
		.map(n => `- [[${n.path.replace(/\.md$/, '')}]]`)
		.join('\n');

	const content = `---
tags: [bridge-note, ${communityA.label}, ${communityB.label}]
---

# Bridge: ${communityA.label} <-> ${communityB.label}

## Context
This note bridges two knowledge communities in your vault.

## From ${communityA.label}
${topNodesA || '- (no top nodes)'}

## From ${communityB.label}
${topNodesB || '- (no top nodes)'}

## Connections
<!-- Add your synthesis here -->
`;

	const file = await app.vault.create(filename, content);

	// Open the new file
	const leaf = app.workspace.getLeaf();
	await leaf.openFile(file);

	return file;
}
