import { detectRepetition, pLimit } from '../src/service/agents/report/stream-utils';

// --- detectRepetition tests ---

// Normal text — no repetition (genuinely varied content > 500 chars)
const normalText =
	'The quick brown fox jumps over the lazy dog. ' +
	'Pack my box with five dozen liquor jugs. ' +
	'How vividly daft jumping zebras vex. ' +
	'Sphinx of black quartz, judge my vow. ' +
	'The five boxing wizards jump quickly. ' +
	'Bright vixens jump; dozy fowl quack. ' +
	'Waltz, nymph, for quick jigs vex Bud. ' +
	'Glib jocks quiz nymph to vex dwarf. ' +
	'Jackdaws love my big sphinx of quartz. ' +
	'The jay, pig, fox, zebra and my wolves quack. ' +
	'Blowzy red vixens fight for a quick jump. ' +
	'Jumpy halfback zips through the foxy defense. ' +
	'A wizard job is to vex chumps quickly in fog. ' +
	'Quick wafting zephyrs vex bold Jim.';
console.assert(normalText.length > 500, 'Normal text must exceed window size');
console.assert(detectRepetition(normalText) === -1, 'Normal text should not trigger repetition');

// Obvious repetition — Chinese pattern (prefix must push total > 500 JS chars)
const prefix = '这是一段正常的开头文字，包含了很多不同的内容和想法。这是非常丰富的文本，具有多样性和深度。接下来的内容会有重复模式出现，我们需要检测到它。这个前缀需要足够长以填充窗口的开始部分，确保检测算法能够正常工作。'.repeat(5);
const repeated = prefix + '个性化的管理系统'.repeat(30);
const cut = detectRepetition(repeated);
console.assert(cut > 0 && cut < repeated.length, `Chinese repetition: expected truncation, got ${cut}`);

// Short text — below window threshold
console.assert(detectRepetition('短文本') === -1, 'Short text should return -1');

// Edge: pattern at exactly 3 repeats (total must be > 500 chars)
const edge = 'A'.repeat(500) + 'hello world test!'.repeat(3);
const edgeCut = detectRepetition(edge);
console.assert(edgeCut > 0, `Edge 3x repeat: expected truncation, got ${edgeCut}`);

// --- pLimit tests ---

async function testPLimit() {
	let maxConcurrent = 0;
	let current = 0;
	const limit = pLimit(2);

	const task = (ms: number) => limit(async () => {
		current++;
		maxConcurrent = Math.max(maxConcurrent, current);
		await new Promise((r) => setTimeout(r, ms));
		current--;
		return ms;
	});

	const results = await Promise.all([task(50), task(50), task(50), task(50)]);
	console.assert(maxConcurrent === 2, `pLimit: expected max concurrent 2, got ${maxConcurrent}`);
	console.assert(results.length === 4, 'pLimit: all tasks should complete');
}

(async () => {
	await testPLimit();
	console.log('All stream-utils tests passed');
})();
