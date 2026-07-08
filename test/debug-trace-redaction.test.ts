import assert from 'assert';
import { createDefaultRedactor, createNoOpRedactor } from '@/core/debug-trace';

console.log('debug-trace-redaction: default patterns');
{
	const r = createDefaultRedactor();

	const cases: Array<{ input: string; expectPattern: string; kept?: string[] }> = [
		{
			input: 'Use key sk-abcdef1234567890abcd to call OpenAI',
			expectPattern: 'openai-key',
			kept: ['Use key', 'to call OpenAI'],
		},
		{
			input: 'sk-ant-abcdef1234567890abcd ...',
			expectPattern: 'anthropic-key',
		},
		{
			input: 'sk-or-abcdef1234567890abcd ...',
			expectPattern: 'openrouter-key',
		},
		{
			input: 'AIzaSyABCDEFGHIJKLMNOPQRSTUV12345',
			expectPattern: 'google-key',
		},
		{
			input: 'Authorization: Bearer abcdef1234567890qwertyuiop',
			expectPattern: 'bearer-token',
		},
		{
			input: 'x-api-key: "abcdef1234567890qwerty"',
			expectPattern: 'auth-header-value',
		},
		{
			input: 'token=eyJabcdefghij.eyKabcdefghij.eyLabcdefghij',
			expectPattern: 'jwt',
		},
	];

	for (const c of cases) {
		const { safe, hits } = r.redact(c.input);
		assert.ok(!safe.includes(c.input.split(' ').find((w) => w.length > 15)!), `secret should be replaced in ${c.expectPattern}`);
		assert.ok(hits.length >= 1, `at least one hit expected for ${c.expectPattern}`);
		assert.ok(
			hits.some((h) => h.pattern === c.expectPattern),
			`missing pattern ${c.expectPattern} in hits ${JSON.stringify(hits)}`,
		);
		if (c.kept) {
			for (const k of c.kept) {
				assert.ok(safe.includes(k), `plain text '${k}' should be preserved`);
			}
		}
	}
}

console.log('debug-trace-redaction: multiple hits accumulate');
{
	const r = createDefaultRedactor();
	const { safe, hits } = r.redact('sk-abcdefghij1234567890 sk-abcdefghij0987654321');
	// Both should be replaced
	assert.ok(!/sk-abcdefghij1234567890/.test(safe));
	assert.ok(!/sk-abcdefghij0987654321/.test(safe));
	const openai = hits.find((h) => h.pattern === 'openai-key');
	assert.strictEqual(openai?.count, 2);
}

console.log('debug-trace-redaction: empty input safe');
{
	const r = createDefaultRedactor();
	assert.deepStrictEqual(r.redact(''), { safe: '', hits: [] });
}

console.log('debug-trace-redaction: no-op redactor is transparent');
{
	const r = createNoOpRedactor();
	const input = 'sk-abcdef1234567890abcd should stay';
	const out = r.redact(input);
	assert.strictEqual(out.safe, input);
	assert.strictEqual(out.hits.length, 0);
}

console.log('debug-trace-redaction: OK');
