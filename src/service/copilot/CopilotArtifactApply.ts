import type { DocumentContext } from './CopilotActionRegistry';
import type { ChangeBlockArtifact, CopilotRunArtifacts } from './CopilotRunArtifacts';

export interface ApplyCopilotArtifactsResult {
	appliedBlocks: number;
}

function selectedChangeBlocks(artifacts: CopilotRunArtifacts, selectedOnly: boolean): ChangeBlockArtifact[] {
	return artifacts.changes.flatMap(change => change.blocks)
		.filter(block => !selectedOnly || block.selected !== false);
}

/**
 * Pure text transform — apply Copilot change-blocks to `text`. Append-only
 * blocks (no `before`) get appended with a separating newline; replacement
 * blocks substitute `before` with `after`. Exposed for unit tests.
 */
export function applyCopilotBlocksPure(text: string, blocks: ChangeBlockArtifact[]): { text: string; appliedBlocks: number } {
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

/**
 * IO primitives the orchestrator needs. The app adapter
 * (`src/app/copilot/panels/AppCopilotPanelVaultAdapter.ts`) supplies these
 * by closing over `app.vault` / `app.workspace.activeEditor`. Service code
 * no longer reaches `AppContext.getInstance().app`.
 *
 * T11M: replaces the old `app: App` parameter so this helper has zero
 * Obsidian concrete dependency at the type level.
 */
export interface ApplyCopilotArtifactsOps {
	readFile(file: DocumentContext['file']): Promise<string>;
	writeFile(file: DocumentContext['file'], text: string): Promise<void>;
	getEditorSelection(): string | null;
	replaceEditorSelection(text: string): void;
}

/**
 * Orchestrate change-block application for either `scope: 'selection'` or
 * `scope: 'file'`. Pure helper for the `CopilotPanelVaultPort.applyArtifacts`
 * adapter — callers do not invoke this directly anymore.
 */
export async function applyCopilotArtifactsToContext(params: {
	ctx: DocumentContext;
	artifacts: CopilotRunArtifacts;
	selectedOnly?: boolean;
	ops: ApplyCopilotArtifactsOps;
}): Promise<ApplyCopilotArtifactsResult> {
	const blocks = selectedChangeBlocks(params.artifacts, params.selectedOnly ?? false);
	if (blocks.length === 0) return { appliedBlocks: 0 };

	const { ops } = params;
	if (params.ctx.scope === 'selection') {
		const live = ops.getEditorSelection();
		if (live === null) return { appliedBlocks: 0 };
		const currentSelection = live || params.ctx.selection || '';
		const result = applyCopilotBlocksPure(currentSelection, blocks);
		if (result.appliedBlocks > 0) ops.replaceEditorSelection(result.text);
		return { appliedBlocks: result.appliedBlocks };
	}

	const current = await ops.readFile(params.ctx.file);
	const result = applyCopilotBlocksPure(current, blocks);
	if (result.appliedBlocks > 0) await ops.writeFile(params.ctx.file, result.text);
	return { appliedBlocks: result.appliedBlocks };
}
