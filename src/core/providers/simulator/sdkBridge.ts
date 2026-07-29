import { DEFAULT_SIMULATOR_PROFILE_CONFIG, type Profile } from '@/core/profiles/types';
import { resolveSimulatorIntent, simulatorDelayMs } from './scenarioEngine';
import {
	resolveSimulatorChunkDelay,
	SIMULATOR_DEFAULTS,
	splitSimulatorText,
} from './SimulatorDefaults';

export interface SimulatorSdkQueryOptions {
	prompt: string;
	systemPrompt: string;
	signal?: AbortSignal;
}

export async function* querySimulatorSdk(
	profile: Profile,
	options: SimulatorSdkQueryOptions,
): AsyncGenerator<unknown> {
	const config = { ...DEFAULT_SIMULATOR_PROFILE_CONFIG, ...profile.simulatorConfig };
	const intent = resolveSimulatorIntent({
		prompt: [
			{ role: 'system', content: options.systemPrompt },
			{ role: 'user', content: [{ type: 'text', text: options.prompt }] },
		],
		availableTools: [],
		config,
	});
	const delayMs = simulatorDelayMs({ config });
	await delay(delayMs, options.signal);

	if (intent.kind === 'error') throw new Error(intent.message);
	if (intent.kind !== 'text') {
		throw new Error(SIMULATOR_DEFAULTS.errors.unsupportedSdkTool);
	}

	for (const chunk of splitSimulatorText(intent.text)) {
		await delay(resolveSimulatorChunkDelay(delayMs), options.signal);
		yield {
			type: 'stream_event',
			event: {
				type: 'content_block_delta',
				delta: { type: 'text_delta', text: chunk },
			},
		};
	}

	yield {
		type: 'result',
		subtype: 'success',
		is_error: false,
		result: intent.text,
		usage: {
			input_tokens: SIMULATOR_DEFAULTS.usage.inputTokens,
			output_tokens: SIMULATOR_DEFAULTS.usage.outputTokens,
			cache_read_input_tokens: 0,
		},
	};
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
