import type { LanguageModel } from 'ai';
import type {
	LanguageModelV3,
	LanguageModelV3CallOptions,
	LanguageModelV3Content,
	LanguageModelV3FinishReason,
	LanguageModelV3StreamPart,
	LanguageModelV3Usage,
} from '@ai-sdk/provider';
import { DEFAULT_SIMULATOR_PROFILE_CONFIG, type Profile } from '@/core/profiles/types';
import { resolveSimulatorIntent, simulatorDelayMs } from './scenarioEngine';
import {
	resolveSimulatorChunkDelay,
	SIMULATOR_DEFAULTS,
	splitSimulatorText,
} from './SimulatorDefaults';

const USAGE: LanguageModelV3Usage = {
	inputTokens: {
		total: SIMULATOR_DEFAULTS.usage.inputTokens,
		noCache: SIMULATOR_DEFAULTS.usage.inputTokens,
		cacheRead: undefined,
		cacheWrite: undefined,
	},
	outputTokens: {
		total: SIMULATOR_DEFAULTS.usage.outputTokens,
		text: SIMULATOR_DEFAULTS.usage.outputTokens,
		reasoning: undefined,
	},
};

export function createSimulatorLanguageModel(profile: Profile, modelId: string): LanguageModel {
	const config = { ...DEFAULT_SIMULATOR_PROFILE_CONFIG, ...profile.simulatorConfig };

	const model: LanguageModelV3 = {
		specificationVersion: 'v3',
		provider: 'simulator',
		modelId,
		supportedUrls: {},
		async doGenerate(options) {
			const intent = resolveIntent(options);
			if (intent.kind === 'error') throw new Error(intent.message);
			const content: LanguageModelV3Content[] = intent.kind === 'tool-call'
				? [{
					type: 'tool-call',
					toolCallId: makeToolCallId(intent.toolName),
					toolName: intent.toolName,
					input: JSON.stringify(intent.input),
				}]
				: [{ type: 'text', text: intent.text }];
			return {
				content,
				finishReason: finishReason(intent.kind),
				usage: USAGE,
				warnings: [],
			};
		},
		async doStream(options) {
			const intent = resolveIntent(options);
			const delayMs = simulatorDelayMs({ config });
			return {
				stream: streamIntent(intent, delayMs, options.abortSignal),
				request: { body: { provider: 'simulator', scenario: config.scenario } },
			};
		},
	};

	return model as LanguageModel;

	function resolveIntent(options: LanguageModelV3CallOptions) {
		return resolveSimulatorIntent({
			prompt: options.prompt,
			availableTools: (options.tools ?? [])
				.filter((tool): tool is Extract<typeof tool, { type: 'function' }> => tool.type === 'function')
				.map((tool) => tool.name),
			config,
		});
	}
}

function streamIntent(
	intent: ReturnType<typeof resolveSimulatorIntent>,
	delayMs: number,
	signal?: AbortSignal,
): ReadableStream<LanguageModelV3StreamPart> {
	return new ReadableStream<LanguageModelV3StreamPart>({
		async start(controller) {
			try {
				await delay(delayMs, signal);
				if (intent.kind === 'error') throw new Error(intent.message);
				controller.enqueue({ type: 'stream-start', warnings: [] });
				if (intent.kind === 'tool-call') {
					controller.enqueue({
						type: 'tool-call',
						toolCallId: makeToolCallId(intent.toolName),
						toolName: intent.toolName,
						input: JSON.stringify(intent.input),
					});
				} else {
					const id = `sim-text-${Date.now()}`;
					controller.enqueue({ type: 'text-start', id });
					for (const chunk of splitSimulatorText(intent.text)) {
						await delay(resolveSimulatorChunkDelay(delayMs), signal);
						controller.enqueue({ type: 'text-delta', id, delta: chunk });
					}
					controller.enqueue({ type: 'text-end', id });
				}
				controller.enqueue({
					type: 'finish',
					finishReason: finishReason(intent.kind),
					usage: USAGE,
				});
				controller.close();
			} catch (error) {
				controller.error(error);
			}
		},
	});
}

function finishReason(kind: 'tool-call' | 'text'): LanguageModelV3FinishReason {
	const unified = kind === 'tool-call' ? 'tool-calls' : 'stop';
	return { unified, raw: unified };
}

function makeToolCallId(toolName: string): string {
	return `sim-${toolName}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
	if (signal?.aborted) return Promise.reject(new Error(SIMULATOR_DEFAULTS.errors.aborted));
	if (ms <= 0) return Promise.resolve();
	return new Promise((resolve, reject) => {
		const timer = setTimeout(resolve, ms);
		signal?.addEventListener('abort', () => {
			clearTimeout(timer);
			reject(new Error(SIMULATOR_DEFAULTS.errors.aborted));
		}, { once: true });
	});
}
