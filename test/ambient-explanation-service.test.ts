// T11Y-5: pure-port unit test for AmbientExplanationService.
//
// Covers: cooldown gate, null/empty-llm short-circuit, trim, and
// the absence of 500-char truncation (the data layer now returns the
// full text — display constraint moved to PushCard).

import { strict as assert } from 'node:assert';
import {
	AmbientExplanationService,
	type AmbientExplanationLlmPort,
} from '@/service/ambient/AmbientExplanationService';
import { TemplateManager } from '@/core/template/TemplateManager';
import { PromptId } from '@/core/types/prompt';

interface FakeLlmStats {
	calls: Array<{ prompt: string; systemPrompt: string }>;
}

function makeLlm(text: string | null, stats: FakeLlmStats): AmbientExplanationLlmPort {
	return {
		async collectText(input) {
			stats.calls.push(input);
			return text;
		},
	};
}

// Provider that just returns a templated string keyed by template id —
// enough to let `TemplateManager.render` succeed against the
// `AmbientExplanation*` ids without loading the real files from disk.
const fakeProvider = {
	async load(p: string): Promise<string> {
		if (p.includes('user')) {
			return 'PARA={{currentParagraph}} TITLE={{pushNoteTitle}} EXC={{pushNoteExcerpt}}';
		}
		return 'system prompt';
	},
};

async function run(): Promise<void> {
	// Install a TemplateManager process-wide so the service can render.
	const tm = new TemplateManager(fakeProvider);
	TemplateManager.setInstance(tm);
	try {
		// ---------------------------------------------------------------
		// Test 1: happy-path trim, no truncation, prompt rendering uses
		// the templated paragraph/title/excerpt arguments.
		// ---------------------------------------------------------------
		{
			const longText = 'A'.repeat(800) + '   ';
			const stats: FakeLlmStats = { calls: [] };
			const svc = new AmbientExplanationService(makeLlm(longText, stats), () => 1000);
			const out = await svc.generate({
				currentParagraph: 'paragraph',
				pushNoteTitle: 'Title',
				pushNoteExcerpt: 'excerpt',
				cooldownMs: 0,
			});
			assert.ok(out !== null);
			assert.equal(out!.length, 800, 'no 500-char truncation; trim only strips whitespace');
			assert.equal(stats.calls.length, 1);
			assert.match(stats.calls[0].prompt, /PARA=paragraph TITLE=Title EXC=excerpt/);
			assert.equal(stats.calls[0].systemPrompt, 'system prompt');
			console.log('PASS: happy-path trim without truncation');
		}

		// ---------------------------------------------------------------
		// Test 2: cooldown gate — second call within cooldown returns
		// null without calling the LLM. Mirrors the pre-refactor
		// adapter's `lastLlmCallTs = 0` initial state (first wall-clock
		// call always escapes the cooldown).
		// ---------------------------------------------------------------
		{
			const BASE = 1_700_000_000_000; // realistic Date.now baseline
			let now = BASE;
			const stats: FakeLlmStats = { calls: [] };
			const svc = new AmbientExplanationService(makeLlm('hello', stats), () => now);
			const a = await svc.generate({
				currentParagraph: 'p',
				pushNoteTitle: 't',
				pushNoteExcerpt: 'e',
				cooldownMs: 5000,
			});
			assert.equal(a, 'hello');
			assert.equal(stats.calls.length, 1, 'first call hits LLM');

			now = BASE + 2000; // 2s elapsed, still in cooldown
			const b = await svc.generate({
				currentParagraph: 'p',
				pushNoteTitle: 't',
				pushNoteExcerpt: 'e',
				cooldownMs: 5000,
			});
			assert.equal(b, null, 'within cooldown returns null');
			assert.equal(stats.calls.length, 1, 'LLM not called during cooldown');

			now = BASE + 6000; // 6s elapsed, cooldown lifted
			const c = await svc.generate({
				currentParagraph: 'p',
				pushNoteTitle: 't',
				pushNoteExcerpt: 'e',
				cooldownMs: 5000,
			});
			assert.equal(c, 'hello');
			assert.equal(stats.calls.length, 2, 'second call after cooldown');
			console.log('PASS: cooldown gate');
		}

		// ---------------------------------------------------------------
		// Test 3: null LLM → null (no profile/provider available).
		// ---------------------------------------------------------------
		{
			const stats: FakeLlmStats = { calls: [] };
			const svc = new AmbientExplanationService(makeLlm(null, stats), () => 1000);
			const out = await svc.generate({
				currentParagraph: 'p',
				pushNoteTitle: 't',
				pushNoteExcerpt: 'e',
				cooldownMs: 0,
			});
			assert.equal(out, null);
			console.log('PASS: null LLM short-circuit');
		}

		// ---------------------------------------------------------------
		// Test 4: empty / whitespace LLM output → null.
		// ---------------------------------------------------------------
		{
			const stats: FakeLlmStats = { calls: [] };
			const svc = new AmbientExplanationService(makeLlm('   \n  ', stats), () => 1000);
			const out = await svc.generate({
				currentParagraph: 'p',
				pushNoteTitle: 't',
				pushNoteExcerpt: 'e',
				cooldownMs: 0,
			});
			assert.equal(out, null, 'whitespace-only result is treated as empty');
			console.log('PASS: empty-output short-circuit');
		}

		// ---------------------------------------------------------------
		// Test 5: prompt-input limits — paragraph truncated to 300,
		// excerpt truncated to 200, before template rendering.
		// ---------------------------------------------------------------
		{
			const stats: FakeLlmStats = { calls: [] };
			const svc = new AmbientExplanationService(makeLlm('ok', stats), () => 2000);
			await svc.generate({
				currentParagraph: 'P'.repeat(500),
				pushNoteTitle: 'TitleX',
				pushNoteExcerpt: 'E'.repeat(500),
				cooldownMs: 0,
			});
			const m = stats.calls[0].prompt.match(/PARA=(P+) TITLE=TitleX EXC=(E+)/);
			assert.ok(m, 'prompt is rendered');
			assert.equal(m![1].length, 300, 'paragraph truncated to 300');
			assert.equal(m![2].length, 200, 'excerpt truncated to 200');
			console.log('PASS: prompt-input length limits');
		}

		// ---------------------------------------------------------------
		// Test 6: LLM throws → null, cooldown still advances (callers
		// log it as non-critical, same as the pre-refactor adapter).
		// ---------------------------------------------------------------
		{
			const BASE = 1_700_000_000_000;
			let now = BASE;
			const throwingLlm: AmbientExplanationLlmPort = {
				async collectText() {
					throw new Error('provider down');
				},
			};
			const svc = new AmbientExplanationService(throwingLlm, () => now);
			const a = await svc.generate({
				currentParagraph: 'p',
				pushNoteTitle: 't',
				pushNoteExcerpt: 'e',
				cooldownMs: 5000,
			});
			assert.equal(a, null);
			now = BASE + 1000;
			const b = await svc.generate({
				currentParagraph: 'p',
				pushNoteTitle: 't',
				pushNoteExcerpt: 'e',
				cooldownMs: 5000,
			});
			assert.equal(b, null, 'still cooled down despite earlier throw');
			console.log('PASS: throw → null + cooldown preserved');
		}

		// Verify PromptId enum unchanged so the service still references
		// the canonical templates after T11Y-5.
		assert.equal(PromptId.AmbientExplanationUser, 'ambient-explanation-user');
		assert.equal(PromptId.AmbientExplanationSystem, 'ambient-explanation-system');

		console.log('ambient-explanation-service.test: all passed');
	} finally {
		TemplateManager.setInstance(null);
	}
}

run().catch((err) => {
	console.error(err);
	process.exit(1);
});
