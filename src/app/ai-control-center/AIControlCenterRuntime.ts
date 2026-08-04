import type { App } from 'obsidian';
import type { AIControlActionSummary, AIControlCenterPort, AIControlProductArea, AIControlPromptSlot, CustomPromptDraft, EditableBuiltInPrompt } from '@/core/ports/AIControlCenterPort';
import type { PromptId } from '@/core/types/prompt';
import { getTemplateMetadata } from '@/core/template/TemplateRegistry';
import type { AIServiceManager } from '@/service/chat/service-manager';
import type { CopilotActionRuntime } from '@/service/copilot/actions/CopilotActionRuntime';
import type { CustomPromptDefShape } from '@/core/ports/CustomPromptSourcePort';
import { ObsidianCustomPromptSourceAdapter } from '@/app/copilot/actions/ObsidianCustomPromptSourceAdapter';
import { REGISTERED_AI_CONTROL_ACTIONS } from './AIControlActionCatalog';
import { describePromptInputs } from './promptTemplateInputs';

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
		const copilotActions = this.opts.copilotActions?.getAll()
			.filter((action) => action.promptIds && action.promptIds.length > 0)
			.map((action) => ({
				id: action.id,
				label: action.label,
				description: action.description,
				area: areaForCopilotCategory(action.category),
				promptIds: [...action.promptIds!],
			})) ?? [];
		const entries = [
			...REGISTERED_AI_CONTROL_ACTIONS,
			...copilotActions,
		];
		return Promise.all(entries.map(async (entry) => ({
			id: entry.id,
			label: entry.label,
			description: entry.description,
			area: entry.area,
			promptSlots: await this.readPromptSlots(entry.promptIds),
		}))).then((actions) => actions
			.filter((action) => action.promptSlots.length > 0)
			.sort((a, b) => a.area.localeCompare(b.area) || a.label.localeCompare(b.label)));
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
			inputs: describePromptInputs(editable.content),
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

	private async readPromptSlots(ids: readonly PromptId[]): Promise<readonly AIControlPromptSlot[]> {
		const expanded = expandPromptPair(ids);
		return Promise.all(expanded.map(async ({ id, role }) => {
			const prompt = await this.readBuiltInPrompt(id);
			return {
				id,
				role,
				label: prompt.label,
				description: prompt.description,
				inputs: prompt.inputs,
			};
		}));
	}
}

function areaForCopilotCategory(category: 'document' | 'vault' | 'writing'): AIControlProductArea {
	return category === 'vault' ? 'vault-intelligence' : 'composer-copilot';
}

function expandPromptPair(ids: readonly PromptId[]): Array<Pick<AIControlPromptSlot, 'id' | 'role'>> {
	const result: Array<Pick<AIControlPromptSlot, 'id' | 'role'>> = [];
	for (const id of ids) {
		const meta = getTemplateMetadata(id);
		if (meta.systemPromptId && !result.some((slot) => slot.id === meta.systemPromptId)) {
			result.push({ id: meta.systemPromptId, role: 'system' });
		}
		if (result.some((slot) => slot.id === id)) continue;
		result.push({
			id,
			role: meta.systemPromptId ? 'user' : 'instruction',
		});
	}
	return result.slice(0, 2);
}
