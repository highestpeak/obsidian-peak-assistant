import { AppContext } from '@/app/context/AppContext';
import type { DocumentContext } from './CopilotActionRegistry';
import type { ChangeBlockArtifact, CopilotRunArtifacts } from './CopilotRunArtifacts';

export interface ApplyCopilotArtifactsResult {
	appliedBlocks: number;
}

function selectedChangeBlocks(artifacts: CopilotRunArtifacts, selectedOnly: boolean): ChangeBlockArtifact[] {
	return artifacts.changes.flatMap(change => change.blocks)
		.filter(block => !selectedOnly || block.selected !== false);
}

function applyBlocksToText(text: string, blocks: ChangeBlockArtifact[]): { text: string; appliedBlocks: number } {
	let next = text;
	let appliedBlocks = 0;

	for (const block of blocks) {
		if (!block.before) {
			const separator = next.endsWith('\n') ? '\n' : '\n\n';
			next = `${next}${separator}${block.after}`;
			appliedBlocks++;
			continue;
		}

		if (!next.includes(block.before)) continue;
		next = next.replace(block.before, block.after);
		appliedBlocks++;
	}

	return { text: next, appliedBlocks };
}

export async function applyCopilotArtifactsToContext(params: {
	ctx: DocumentContext;
	artifacts: CopilotRunArtifacts;
	selectedOnly?: boolean;
}): Promise<ApplyCopilotArtifactsResult> {
	const blocks = selectedChangeBlocks(params.artifacts, params.selectedOnly ?? false);
	if (blocks.length === 0) return { appliedBlocks: 0 };

	const app = AppContext.getInstance().app;
	if (params.ctx.scope === 'selection') {
		const editor = app.workspace.activeEditor?.editor;
		if (!editor) return { appliedBlocks: 0 };
		const currentSelection = editor.getSelection() || params.ctx.selection || '';
		const result = applyBlocksToText(currentSelection, blocks);
		if (result.appliedBlocks > 0) editor.replaceSelection(result.text);
		return { appliedBlocks: result.appliedBlocks };
	}

	const current = await app.vault.read(params.ctx.file);
	const result = applyBlocksToText(current, blocks);
	if (result.appliedBlocks > 0) {
		await app.vault.modify(params.ctx.file, result.text);
	}
	return { appliedBlocks: result.appliedBlocks };
}
