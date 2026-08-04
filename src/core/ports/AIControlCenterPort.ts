import type { PromptId } from '@/core/types/prompt';
import type { CustomPromptDefShape } from '@/core/ports/CustomPromptSourcePort';
import type { ChatAssistantDefinition } from '@/core/types/chat-studio';

export interface AIControlActionSummary {
	readonly id: string;
	readonly label: string;
	readonly description: string;
	readonly area: AIControlProductArea;
	readonly promptSlots: readonly AIControlPromptSlot[];
}

export type AIControlProductArea =
	| 'search-knowledge'
	| 'ai-search-graph'
	| 'composer-copilot'
	| 'chat-generation'
	| 'vault-intelligence';

export interface AIControlPromptInput {
	readonly name: string;
	readonly description: string;
}

export interface AIControlPromptSlot {
	readonly id: PromptId;
	readonly role: 'system' | 'user' | 'instruction';
	readonly label: string;
	readonly description: string;
	readonly inputs: readonly AIControlPromptInput[];
}

export interface EditableBuiltInPrompt {
	readonly id: PromptId;
	readonly label: string;
	readonly description: string;
	readonly content: string;
	readonly overridden: boolean;
	readonly inputs: readonly AIControlPromptInput[];
}

export interface CustomPromptDraft {
	readonly filePath?: string;
	readonly label: string;
	readonly description?: string;
	readonly category: CustomPromptDefShape['category'];
	readonly template: string;
	readonly modelId?: string;
}

/**
 * User-facing controls for actual AI owners. It intentionally omits route
 * traces, cache state and controls that current runs do not consume.
 */
export interface AIControlCenterPort {
	listActions(): Promise<readonly AIControlActionSummary[]>;
	listCustomPrompts(): Promise<readonly CustomPromptDefShape[]>;
	listAssistants(): Promise<readonly ChatAssistantDefinition[]>;
	readBuiltInPrompt(id: PromptId): Promise<EditableBuiltInPrompt>;
	saveBuiltInPrompt(id: PromptId, content: string): Promise<void>;
	resetBuiltInPrompt(id: PromptId): Promise<void>;
	createCustomPrompt(draft: CustomPromptDraft): Promise<CustomPromptDefShape>;
	updateCustomPrompt(draft: Required<Pick<CustomPromptDraft, 'filePath'>> & CustomPromptDraft): Promise<CustomPromptDefShape>;
	deleteCustomPrompt(filePath: string): Promise<void>;
}
