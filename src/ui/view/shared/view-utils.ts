import { App, TFile, ViewState, WorkspaceLeaf } from 'obsidian';

/**
 * Switch to document view and open the source file
 */
export async function openSourceFile(app: App, file: TFile): Promise<void> {
	const existingMarkdownLeaves = app.workspace.getLeavesOfType('markdown');
	let centerLeaf: WorkspaceLeaf | null = null;

	if (existingMarkdownLeaves.length > 0) {
		centerLeaf = existingMarkdownLeaves[0];
	} else {
		centerLeaf = app.workspace.getLeaf(false);
	}

	if (centerLeaf) {
		const fallbackLeft: ViewState = { type: 'file-explorer', state: {}, active: true } as ViewState;
		const fallbackRight: ViewState = { type: 'outline', state: {}, active: true } as ViewState;

		const existingFileExplorerLeaves = app.workspace.getLeavesOfType('file-explorer');
		const leftLeaf = existingFileExplorerLeaves[0] ?? app.workspace.getLeftLeaf(false);
		if (leftLeaf) {
			await leftLeaf.setViewState({ ...fallbackLeft, active: false });
		}

		const existingOutlineLeaves = app.workspace.getLeavesOfType('outline');
		const rightLeaf = existingOutlineLeaves[0] ?? app.workspace.getRightLeaf(false);
		if (rightLeaf) {
			await rightLeaf.setViewState({ ...fallbackRight, active: false });
		}

		await centerLeaf.openFile(file);
		await centerLeaf.setViewState({ type: 'markdown', active: true });
		app.workspace.revealLeaf(centerLeaf);
	}
}

