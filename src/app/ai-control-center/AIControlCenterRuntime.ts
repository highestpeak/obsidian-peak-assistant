import type { App } from 'obsidian';
import type { AIControlCenterPort, AIControlActionSummary, CustomPromptDraft, EditableBuiltInPrompt } from '@/core/ports/AIControlCenterPort';
import type { PromptId } from '@/core/types/prompt';
import { getTemplateMetadata } from '@/core/template/TemplateRegistry';
import type { AIServiceManager } from '@/service/chat/service-manager';
import type { CopilotActionRuntime } from '@/service/copilot/actions/CopilotActionRuntime';
import type { CustomPromptDefShape } from '@/core/ports/CustomPromptSourcePort';
import { ObsidianCustomPromptSourceAdapter } from '@/app/copilot/actions/ObsidianCustomPromptSourceAdapter';

export interface AIControlCenterRuntimeOptions {
	app: App;
	manager: AIServiceManager;
	copilotActions: CopilotActionRuntime | null;
	resolveCustomPromptFolder: () => string;
}

/**
 * App-owned adapter for the Control Center. This is deliberately a thin
 * projection over the existing PromptService, Custom Prompt folder and
 * AssistantService: it creates no second configuration store.
 */
export class AIControlCenterRuntime implements AIControlCenterPort {
	private readonly customPrompts: ObsidianCustomPromptSourceAdapter;

	constructor(private readonly opts: AIControlCenterRuntimeOptions) {
		this.customPrompts = new ObsidianCustomPromptSourceAdapter({
			app: opts.app,
			resolveFolder: opts.resolveCustomPromptFolder,
		});
	}

	async listActions(): Promise<readonly AIControlActionSummary[]> {
		const runtime = this.opts.copilotActions;
		if (!runtime) return [];
		return runtime.getAll()
			.filter((action) => action.promptIds && action.promptIds.length > 0)
			.map((action) => ({
				id: action.id,
				label: action.label,
				description: action.description,
				category: action.category,
				promptIds: [...action.promptIds!],
			}))
			.sort((a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label));
	}

	async listCustomPrompts(): Promise<readonly CustomPromptDefShape[]> {
		return this.customPrompts.loadAll();
	}

	async listAssistants() {
		return this.opts.manager.assistant.list();
	}

	async readBuiltInPrompt(id: PromptId): Promise<EditableBuiltInPrompt> {
		const editable = await this.opts.manager.prompt.getEditablePrompt(id);
		const meta = getTemplateMetadata(id);
		return {
			id,
			label: meta.label ?? id,
			description: meta.description ?? 'Instructions used by the owning AI action.',
			content: editable.content,
			overridden: editable.overridden,
		};
	}

	async saveBuiltInPrompt(id: PromptId, content: string): Promise<void> {
		await this.opts.manager.prompt.savePromptOverride(id, content);
	}

	async resetBuiltInPrompt(id: PromptId): Promise<void> {
		await this.opts.manager.prompt.deleteOverride(id);
	}

	async createCustomPrompt(draft: CustomPromptDraft): Promise<CustomPromptDefShape> {
		return this.customPrompts.create(draft);
	}

	async updateCustomPrompt(draft: Required<Pick<CustomPromptDraft, 'filePath'>> & CustomPromptDraft): Promise<CustomPromptDefShape> {
		return this.customPrompts.update(draft);
	}

	async deleteCustomPrompt(filePath: string): Promise<void> {
		await this.customPrompts.delete(filePath);
	}
}
