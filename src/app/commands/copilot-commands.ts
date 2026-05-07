// src/app/commands/copilot-commands.ts
import type { Command } from 'obsidian';
import { Notice } from 'obsidian';
import { isDesktop } from '@/core/platform';
import { AppContext } from '@/app/context/AppContext';
import { CopilotActionRegistry } from '@/service/copilot/CopilotActionRegistry';
import { DocumentContextBuilder } from '@/service/copilot/DocumentContextBuilder';
import { CopilotResultModal } from '@/ui/view/copilot/CopilotResultModal';
import { CopilotActionEvent } from '@/core/eventBus';
import { getSelectedTextFromActiveEditor } from '@/core/utils/obsidian-utils';

export function buildCopilotCommands(): Command[] {
	if (!isDesktop()) return [];

	const registry = CopilotActionRegistry.getInstance();

	return registry.getAll().map(action => ({
		id: `peak-copilot-${action.id}`,
		name: `Copilot: ${action.label}`,
		callback: async () => {
			const appContext = AppContext.getInstance();
			const app = appContext.app;
			const file = app.workspace.getActiveFile();
			if (!file) { new Notice('Open a document first'); return; }

			const content = await app.vault.cachedRead(file);
			const selected = getSelectedTextFromActiveEditor(app) ?? undefined;
			const ctx = DocumentContextBuilder.build(app, file, content, selected);

			// Guard check
			const guardMsg = action.guard?.(ctx);
			if (guardMsg) { new Notice(guardMsg); return; }

			// Open result modal in loading state
			const modal = new CopilotResultModal(app, { action, ctx });
			modal.open();

			try {
				const result = await action.execute(ctx, (text) => modal.updateProgress(text));
				if (result.type === 'error') {
					modal.setError(new Error(result.message));
				} else {
					modal.setResult(result.type === 'structured' ? result.data : result.text);
				}
			} catch (e: any) {
				modal.setError(e);
			}

			AppContext.getEventBus().dispatch(new CopilotActionEvent({
				action: action.id,
				targetFile: file.path,
				resultSummary: `${action.label}: ${file.basename}`,
			}));
		},
	}));
}
