import assert from 'assert';
import { translateSdkMessage, translateSdkMessages } from '@/service/agents/core/sdkMessageAdapter';
import { StreamTriggerName } from '@/core/providers/types';

/**
 * Build the SDK message stream a real streaming turn produces when
 * `includePartialMessages: true` (which queryWithProfile ALWAYS sets):
 * incremental `stream_event` text deltas during generation, followed by the
 * final full `assistant` message block, then `result`. This is the exact
 * shape that doubled Composer polish output in real-provider QA — the fake
 * canned-variant executors never modeled it.
 */
async function* fakePartialMessageStream(chunks: string[], full: string): AsyncGenerator<any> {
	yield { type: 'system', subtype: 'init', session_id: 's1', model: 'claude-x' };
	for (const chunk of chunks) {
		yield { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: chunk } } };
	}
	// Final aggregated assistant message — SDK sends this in addition to the deltas.
	yield { type: 'assistant', message: { content: [{ type: 'text', text: full }] } };
	yield { type: 'result', subtype: 'success', is_error: false, usage: { input_tokens: 1, output_tokens: 1 }, result: full };
}

async function collectTextDeltas(gen: AsyncGenerator<any>): Promise<string> {
	let text = '';
	for await (const ev of gen) {
		if (ev.type === 'text-delta') text += ev.text;
	}
	return text;
}

async function run(): Promise<void> {
	const tests: Array<{ name: string; fn: () => void | Promise<void> }> = [
		{
			name: 'translateSdkMessage: system init emits pk-debug sdk-round-input',
			fn: () => {
				const sdkMsg = {
					type: 'system',
					subtype: 'init',
					session_id: 'sess-123',
					model: 'claude-opus-4-6',
				};
				const events = translateSdkMessage(sdkMsg, { triggerName: StreamTriggerName.SEARCH_AI_AGENT });
				assert.strictEqual(events.length, 1);
				assert.strictEqual(events[0].type, 'pk-debug');
				assert.strictEqual((events[0] as any).debugName, 'sdk-round-input');
				assert.strictEqual((events[0] as any).extra?.sessionId, 'sess-123');
			},
		},
		{
			name: 'translateSdkMessage: assistant text block emits text-delta',
			fn: () => {
				const sdkMsg = {
					type: 'assistant',
					message: {
						content: [{ type: 'text', text: 'Hello world' }],
					},
				};
				const events = translateSdkMessage(sdkMsg, { triggerName: StreamTriggerName.SEARCH_AI_AGENT });
				const textDeltas = events.filter((e) => e.type === 'text-delta');
				assert.strictEqual(textDeltas.length, 1);
				assert.strictEqual((textDeltas[0] as any).text, 'Hello world');
			},
		},
		{
			name: 'translateSdkMessage: assistant tool_use block emits tool-call',
			fn: () => {
				const sdkMsg = {
					type: 'assistant',
					message: {
						content: [
							{ type: 'tool_use', id: 'tool-abc', name: 'vault_list_folders', input: { maxDepth: 2 } },
						],
					},
				};
				const events = translateSdkMessage(sdkMsg, { triggerName: StreamTriggerName.SEARCH_AI_AGENT });
				const toolCalls = events.filter((e) => e.type === 'tool-call');
				assert.strictEqual(toolCalls.length, 1);
				assert.strictEqual((toolCalls[0] as any).toolName, 'vault_list_folders');
				assert.deepStrictEqual((toolCalls[0] as any).input, { maxDepth: 2 });
				assert.strictEqual((toolCalls[0] as any).id, 'tool-abc');
			},
		},
		{
			name: 'translateSdkMessage: user tool_result emits tool-result',
			fn: () => {
				const sdkMsg = {
					type: 'user',
					message: {
						content: [
							{ type: 'tool_result', tool_use_id: 'tool-abc', content: 'folder1/\nfolder2/' },
						],
					},
				};
				const events = translateSdkMessage(sdkMsg, { triggerName: StreamTriggerName.SEARCH_AI_AGENT });
				const results = events.filter((e) => e.type === 'tool-result');
				assert.strictEqual(results.length, 1);
				assert.strictEqual((results[0] as any).id, 'tool-abc');
				assert.strictEqual((results[0] as any).output, 'folder1/\nfolder2/');
			},
		},
		{
			name: 'translateSdkMessage: result emits complete with usage',
			fn: () => {
				const sdkMsg = {
					type: 'result',
					subtype: 'success',
					session_id: 'sess-123',
					is_error: false,
					usage: {
						input_tokens: 1234,
						output_tokens: 567,
						cache_read_input_tokens: 1000,
					},
					result: 'done',
				};
				const events = translateSdkMessage(sdkMsg, { triggerName: StreamTriggerName.SEARCH_AI_AGENT });
				const completes = events.filter((e) => e.type === 'complete');
				assert.strictEqual(completes.length, 1);
				assert.strictEqual((completes[0] as any).usage.inputTokens, 1234);
				assert.strictEqual((completes[0] as any).usage.outputTokens, 567);
			},
		},
		{
			name: 'translateSdkMessage: unknown type returns pk-debug sdk-unknown',
			fn: () => {
				const sdkMsg = { type: 'weird-unknown-type', extra: 'data' };
				const events = translateSdkMessage(sdkMsg, { triggerName: StreamTriggerName.SEARCH_AI_AGENT });
				assert.strictEqual(events.length, 1);
				assert.strictEqual(events[0].type, 'pk-debug');
				assert.strictEqual((events[0] as any).debugName, 'sdk-unknown');
			},
		},
		{
			// FIX-1 F1 regression: with partial messages enabled, the assistant full
			// block must NOT be re-emitted (else the whole response is doubled).
			name: 'translateSdkMessages: partial deltas + assistant full block do NOT double text (hasPartialMessages:true)',
			fn: async () => {
				const full = 'Polished sentence one. Polished sentence two.';
				const chunks = ['Polished ', 'sentence one. ', 'Polished ', 'sentence two.'];
				const text = await collectTextDeltas(
					translateSdkMessages(fakePartialMessageStream(chunks, full), {
						triggerName: StreamTriggerName.COPILOT,
						hasPartialMessages: true,
					}),
				);
				assert.strictEqual(text, full, `expected single full text, got doubled/other:\n${text}`);
			},
		},
		{
			// Guards the trap in the other direction: WITHOUT the flag the adapter
			// re-emits the assistant block, so callers of includePartialMessages
			// streams MUST pass hasPartialMessages:true. Locks why the fix exists.
			name: 'translateSdkMessages: omitting hasPartialMessages doubles the text (documents the trap)',
			fn: async () => {
				const full = 'Polished sentence one. Polished sentence two.';
				const chunks = ['Polished ', 'sentence one. ', 'Polished ', 'sentence two.'];
				const text = await collectTextDeltas(
					translateSdkMessages(fakePartialMessageStream(chunks, full), {
						triggerName: StreamTriggerName.COPILOT,
					}),
				);
				assert.strictEqual(text, full + full, 'expected the known doubling when flag omitted');
			},
		},
		{
			name: 'translateSdkMessage: assistant thinking block emits reasoning-delta',
			fn: () => {
				const sdkMsg = {
					type: 'assistant',
					message: {
						content: [
							{ type: 'thinking', thinking: 'Let me analyze this query first.' },
						],
					},
				};
				const events = translateSdkMessage(sdkMsg, { triggerName: StreamTriggerName.SEARCH_AI_AGENT });
				const reasoning = events.filter((e) => e.type === 'reasoning-delta');
				assert.strictEqual(reasoning.length, 1);
				assert.strictEqual((reasoning[0] as any).text, 'Let me analyze this query first.');
			},
		},
	];

	let passed = 0;
	let failed = 0;

	for (const test of tests) {
		try {
			await test.fn();
			console.log(`✅ PASS: ${test.name}`);
			passed += 1;
		} catch (error) {
			failed += 1;
			console.error(`❌ FAIL: ${test.name}`);
			console.error(error);
		}
	}

	console.log(`\nSdkMessageAdapter tests: ${passed} passed, ${failed} failed`);
	if (failed > 0) {
		process.exit(1);
	}
}

void run();
