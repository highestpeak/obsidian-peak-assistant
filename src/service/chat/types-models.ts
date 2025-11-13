import { LLMProvider } from './providers/types';

export enum OpenAIModelId {
	GPT_4_1 = 'gpt-4.1',
	GPT_4_1_MINI = 'gpt-4.1-mini',
	GPT_4O = 'gpt-4o',
	GPT_4O_MINI = 'gpt-4o-mini',
	O1 = 'o1',
	O1_MINI = 'o1-mini',
	O1_PREVIEW = 'o1-preview',
}

export enum ClaudeModelId {
	CLAUDE_3_OPUS = 'claude-3-opus-20240229',
	CLAUDE_3_SONNET = 'claude-3-sonnet-20240229',
	CLAUDE_3_HAIKU = 'claude-3-haiku-20240307',
	CLAUDE_3_5_SONNET = 'claude-3-5-sonnet-20240620',
}

export enum GeminiModelId {
	GEMINI_1_5_PRO = 'gemini-1.5-pro',
	GEMINI_1_5_FLASH = 'gemini-1.5-flash',
	GEMINI_1_0_PRO = 'gemini-1.0-pro',
}

export type CustomModelId = string & { readonly __aiCustomModel?: unique symbol };

export type AIModelId = OpenAIModelId | ClaudeModelId | GeminiModelId | CustomModelId;

export function createCustomModelId(value: string): CustomModelId {
	return value as CustomModelId;
}

export function coerceModelId(value: string | undefined | null): AIModelId {
	if (!value) {
		return OpenAIModelId.GPT_4_1_MINI;
	}
	if ((Object.values(OpenAIModelId) as string[]).includes(value)) {
		return value as OpenAIModelId;
	}
	if ((Object.values(ClaudeModelId) as string[]).includes(value)) {
		return value as ClaudeModelId;
	}
	if ((Object.values(GeminiModelId) as string[]).includes(value)) {
		return value as GeminiModelId;
	}
	return createCustomModelId(value);
}

export interface ModelConfig {
	id: string;
	provider: LLMProvider;
	displayName: string;
	maxContextTokens?: number;
}



