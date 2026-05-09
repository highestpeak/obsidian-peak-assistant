import type { TFile } from 'obsidian';
import type { LucideIcon } from 'lucide-react';
import type { LLMStreamEvent } from '@/core/providers/types';

export interface DocumentContext {
	file: TFile;
	title: string;
	content: string;
	selection?: string;
	scope: 'full' | 'selection';
	wordCount: number;
	tags: string[];
	links: string[];
	backlinks: number;
	headingCount: number;
	isOrphan: boolean;
	frontmatter: Record<string, any>;
}

export interface ActionUsage {
	inputTokens: number;
	outputTokens: number;
}

export type ActionResult =
	| { type: 'structured'; data: any; usage?: ActionUsage }
	| { type: 'stream'; text: string; usage?: ActionUsage }
	| { type: 'error'; message: string };

export interface CopilotAction {
	id: string;
	label: string;
	description: string;
	icon: LucideIcon;
	category: 'document' | 'vault' | 'writing';
	relevance(ctx: DocumentContext): number;
	guard?(ctx: DocumentContext): string | null;
	execute(ctx: DocumentContext, signal?: AbortSignal): AsyncGenerator<LLMStreamEvent, ActionResult | void>;
	ResultPanel: React.ComponentType<{ result: any; ctx: DocumentContext; onClose: () => void }>;
}

export class CopilotActionRegistry {
	private static instance: CopilotActionRegistry;
	private actions = new Map<string, CopilotAction>();

	static getInstance(): CopilotActionRegistry {
		if (!this.instance) this.instance = new CopilotActionRegistry();
		return this.instance;
	}

	register(action: CopilotAction): void {
		this.actions.set(action.id, action);
	}

	get(id: string): CopilotAction | undefined {
		return this.actions.get(id);
	}

	getAll(): CopilotAction[] {
		return Array.from(this.actions.values());
	}

	getByCategory(cat: 'document' | 'vault' | 'writing'): CopilotAction[] {
		return this.getAll().filter(a => a.category === cat);
	}

	rank(ctx: DocumentContext): Array<{ action: CopilotAction; score: number }> {
		return this.getAll()
			.map(action => ({ action, score: action.relevance(ctx) }))
			.sort((a, b) => b.score - a.score);
	}
}
