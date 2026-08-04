// T11B (2026-06-14): App-owned implementation of the Copilot manual
// action runtime.
//
// Owns:
//   - the built-in action catalog (created from `CopilotActionPorts` via
//     {@link createBuiltInCopilotActions});
//   - the custom prompt action catalog (rebuilt from
//     `ports.customPrompts.loadAll()`);
//   - ranking, category filtering, lookup.
//
// Has no AppContext / Obsidian / sqlite / ProfileRegistry knowledge —
// those live in the app composition adapters behind `ports`.

import type { CopilotAction, DocumentContext } from '../CopilotActionRegistry';
import type { CustomPromptDef } from '../CustomPromptRegistry';
import { buildCustomPromptAction } from '../CustomPromptRegistry';
import type { CopilotActionPorts } from './CopilotActionPorts';
import type { CopilotActionRuntime, CopilotActionCategory } from './CopilotActionRuntime';
import { createBuiltInCopilotActions } from './index';

export class CopilotActionRuntimeImpl implements CopilotActionRuntime {
	private readonly builtIns: CopilotAction[];
	private customPromptActions: CopilotAction[] = [];
	private customPromptRefreshChain: Promise<void> = Promise.resolve();
	private stopWatchingCustomPrompts: (() => void) | undefined;
	private refreshQueued = false;
	private disposed = false;

	constructor(private readonly ports: CopilotActionPorts) {
		this.builtIns = createBuiltInCopilotActions(ports);
		this.stopWatchingCustomPrompts = ports.customPrompts.watch?.(() => this.queueCustomPromptRefresh());
	}

	getAll(): CopilotAction[] {
		return [...this.builtIns, ...this.customPromptActions];
	}

	get(id: string): CopilotAction | undefined {
		return this.getAll().find(a => a.id === id);
	}

	getByCategory(category: CopilotActionCategory): CopilotAction[] {
		return this.getAll().filter(a => a.category === category);
	}

	rank(ctx: DocumentContext): Array<{ action: CopilotAction; score: number }> {
		return this.getAll()
			.map(action => ({ action, score: action.relevance(ctx) }))
			.sort((a, b) => b.score - a.score);
	}

	async refreshCustomPrompts(): Promise<void> {
		const refresh = this.customPromptRefreshChain.then(() => this.loadCustomPrompts());
		this.customPromptRefreshChain = refresh.catch((err) => {
			console.warn('[CopilotActionRuntime] custom prompt refresh failed:', err);
		});
		return refresh;
	}

	private queueCustomPromptRefresh(): void {
		if (this.disposed || this.refreshQueued) return;
		this.refreshQueued = true;
		void Promise.resolve().then(async () => {
			this.refreshQueued = false;
			if (this.disposed) return;
			await this.refreshCustomPrompts();
		});
	}

	private async loadCustomPrompts(): Promise<void> {
		if (this.disposed) return;
		let defs: CustomPromptDef[] = [];
		try {
			defs = await this.ports.customPrompts.loadAll();
		} catch (err) {
			console.warn('[CopilotActionRuntime] custom prompt load failed:', err);
			defs = [];
		}
		if (this.disposed) return;
		this.customPromptActions = defs.map(def =>
			buildCustomPromptAction(def, this.ports.agent, this.ports.promptTemplates),
		);
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.stopWatchingCustomPrompts?.();
		this.stopWatchingCustomPrompts = undefined;
		this.customPromptActions = [];
	}
}
