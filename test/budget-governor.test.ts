import assert from 'assert';
import { BudgetGovernor } from '../src/service/chat/context/BudgetGovernor';
import type { ContextSlot, SlotConfig, SlotContent } from '../src/service/chat/context/slots/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockSlot(
  id: string,
  tokens: number,
  compressible = true,
  opts: { required?: boolean; priority?: number; maxCompressionLevel?: 0 | 1 | 2 | 3 } = {},
): { slot: ContextSlot; content: SlotContent; config: SlotConfig } {
  return {
    slot: {
      id,
      async build() { return { data: 'x'.repeat(tokens * 4), tokens, compressionLevel: 0 }; },
      async compress(content, level) {
        if (!compressible) return content;
        const factor = level === 1 ? 0.7 : level === 2 ? 0.4 : 0.2;
        const newTokens = Math.floor(content.tokens * factor);
        return { data: content.data, tokens: newTokens, compressionLevel: level };
      },
      estimateTokens(content) { return content.tokens; },
      render(content) { return [{ role: 'system', content: [{ type: 'text', text: String(content.data) }] }]; },
    },
    content: { data: 'x'.repeat(tokens * 4), tokens, compressionLevel: 0 },
    config: {
      slotId: id,
      priority: opts.priority ?? 500,
      maxTokens: tokens * 2,
      required: opts.required ?? false,
      maxCompressionLevel: opts.maxCompressionLevel ?? 3,
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

(async () => {
  const governor = new BudgetGovernor();

  console.log('=== BudgetGovernor ===');

  // 1. Returns all slots when within budget
  {
    const items = [
      mockSlot('a', 100),
      mockSlot('b', 200),
      mockSlot('c', 300),
    ];
    const result = await governor.fit(items, 1000);
    assert.strictEqual(result.length, 3, 'all 3 slots returned when within budget');
    assert.strictEqual(result[0].content.compressionLevel, 0, 'no compression applied');
    console.log('PASS: returns all slots when within budget');
  }

  // 2. Compresses lowest-priority slot first when over budget
  {
    const highPri = mockSlot('high', 100, true, { priority: 1000 });
    const lowPri = mockSlot('low', 100, true, { priority: 100 });
    // Budget of 150 forces compression; total = 200
    // low-priority compressed first: floor(100 * 0.7) = 70; total = 170, still > 150
    // Then high-priority compressed: floor(100 * 0.7) = 70; total = 140 <= 150
    const result = await governor.fit([highPri, lowPri], 150);
    const lowResult = result.find(r => r.slot.id === 'low');
    const highResult = result.find(r => r.slot.id === 'high');
    assert.ok(lowResult, 'low-priority slot still present');
    assert.ok(highResult, 'high-priority slot still present');
    assert.ok(lowResult!.content.compressionLevel > 0, 'low-priority slot was compressed');
    console.log('PASS: compresses lowest-priority slot first when over budget');
  }

  // 3. Drops non-required slot when compression is insufficient
  {
    // Non-compressible slot, budget too small to fit without drop
    const big = mockSlot('big', 500, false, { priority: 100 });
    const small = mockSlot('small', 50, true, { priority: 200 });
    // total = 550, budget = 100; big is not compressible
    // small compresses to floor(50*0.7)=35 → total=535>100
    // Drop phase: big dropped first (lower priority), total=35 ≤ 100 → stop
    const result = await governor.fit([big, small], 100);
    const bigResult = result.find(r => r.slot.id === 'big');
    const smallResult = result.find(r => r.slot.id === 'small');
    assert.ok(!bigResult, 'non-compressible non-required slot dropped');
    assert.ok(smallResult, 'other slot still present');
    console.log('PASS: drops non-required slot when compression is insufficient');
  }

  // 4. Never drops required slots
  {
    const required = mockSlot('req', 1000, true, { required: true, priority: 100 });
    const optional = mockSlot('opt', 200, true, { required: false, priority: 200 });
    // total = 1200, budget = 50; way over budget
    // Compression: opt floor(200*0.7)=140 → total=1140>50, floor(140*0.4)=56→total=1056>50, floor(56*0.2)=11→total=1011>50
    // req: floor(1000*0.7)=700→... but required slots are not in compressible list
    // Drop phase: only optional can be dropped (required is excluded)
    const result = await governor.fit([required, optional], 50);
    const reqResult = result.find(r => r.slot.id === 'req');
    const optResult = result.find(r => r.slot.id === 'opt');
    assert.ok(reqResult, 'required slot is never dropped');
    assert.ok(!optResult, 'optional slot dropped to free space');
    console.log('PASS: never drops required slots');
  }

  // 5. Drops in priority order (lowest priority dropped first)
  {
    const lo = mockSlot('lo', 300, false, { priority: 100 });
    const mid = mockSlot('mid', 300, false, { priority: 500 });
    const hi = mockSlot('hi', 300, false, { priority: 900 });
    // total = 900, budget = 350; none compressible
    // Drop lo (priority 100): 900-300=600 > 350
    // Drop mid (priority 500): 600-300=300 <= 350 → stop
    const result = await governor.fit([lo, mid, hi], 350);
    assert.ok(!result.find(r => r.slot.id === 'lo'), 'lowest priority slot dropped');
    assert.ok(!result.find(r => r.slot.id === 'mid'), 'second lowest priority slot dropped');
    assert.ok(result.find(r => r.slot.id === 'hi'), 'highest priority slot retained');
    console.log('PASS: drops in priority order (lowest priority dropped first)');
  }

  // 6. Compression levels applied in order (L1 before L2 before L3)
  {
    const slot = mockSlot('s', 1000, true, { priority: 500 });
    // L1 compresses to floor(1000*0.7)=700; budget=750 → fits after L1
    const result = await governor.fit([slot], 750);
    const s = result.find(r => r.slot.id === 's');
    assert.ok(s, 'slot present');
    assert.strictEqual(s!.content.compressionLevel, 1, 'only L1 compression applied');
    console.log('PASS: compression levels applied in order (L1 before L2 before L3)');
  }

  console.log('\nAll budget-governor tests passed!');
})().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
