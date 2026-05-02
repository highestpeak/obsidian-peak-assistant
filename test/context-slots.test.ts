import assert from 'assert';
import { estimateTokensFromText } from '../src/service/chat/context/slots/types';

function runTests() {
  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void) {
    try {
      fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (e: any) {
      console.error(`  ✗ ${name}: ${e.message}`);
      failed++;
    }
  }

  // estimateTokensFromText
  test('estimates English text within range', () => {
    const text = 'Hello world, this is a test sentence.';
    const tokens = estimateTokensFromText(text);
    assert.ok(tokens > 5, `expected > 5 but got ${tokens}`);
    assert.ok(tokens < 20, `expected < 20 but got ${tokens}`);
  });

  test('estimates CJK text at least 8 tokens', () => {
    const text = '这是一个测试句子';
    const tokens = estimateTokensFromText(text);
    assert.ok(tokens >= 8, `expected >= 8 but got ${tokens}`);
  });

  test('empty string returns 0', () => {
    assert.strictEqual(estimateTokensFromText(''), 0);
  });

  test('CJK tokens are higher per char than Latin', () => {
    const latin = 'abcdefgh'; // 8 chars
    const cjk = '一二三四五六七八'; // 8 chars
    const latinTokens = estimateTokensFromText(latin);
    const cjkTokens = estimateTokensFromText(cjk);
    assert.ok(cjkTokens > latinTokens, `CJK (${cjkTokens}) should exceed Latin (${latinTokens})`);
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

runTests();
