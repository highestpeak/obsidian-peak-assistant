import assert from 'assert';
import {
	jaccard,
	titleTokens,
	strippedLength,
	strippedWordCount,
	detectNamingViolation,
	hasFrontmatter,
} from '@/service/lint/signals/content';

function approx(a: number, b: number, epsilon = 1e-9): void {
	assert.ok(Math.abs(a - b) < epsilon, `expected ${a} ≈ ${b}`);
}

function testJaccardEmptyPair() {
	assert.strictEqual(jaccard(new Set<string>(), new Set<string>()), 0);
	console.log('[lint-content] jaccard empty pair: PASS');
}

function testJaccardWorkedExample() {
	// Worked example: A = {a, b, c}, B = {b, c, d}
	// intersection = {b, c} = 2; union = 4; jaccard = 2/4 = 0.5.
	const j = jaccard(new Set(['a', 'b', 'c']), new Set(['b', 'c', 'd']));
	approx(j, 0.5);
	console.log('[lint-content] jaccard worked example: PASS');
}

function testJaccardDisjointIsZero() {
	assert.strictEqual(jaccard(new Set(['a']), new Set(['b'])), 0);
	console.log('[lint-content] jaccard disjoint: PASS');
}

function testJaccardIdenticalIsOne() {
	const tokens = new Set(['product', 'launch']);
	assert.strictEqual(jaccard(tokens, tokens), 1);
	console.log('[lint-content] jaccard identical: PASS');
}

function testTitleTokensLowercaseAlnumMinTwo() {
	// "AI-Ops 一览" → alnum tokenizer breaks on '-' and whitespace.
	// tokens: 'ai', 'ops', '一览' (both Unicode alnum). All len ≥ 2.
	const tokens = titleTokens('AI-Ops 一览');
	assert.deepStrictEqual(new Set(tokens), new Set(['ai', 'ops', '一览']));
	console.log('[lint-content] titleTokens unicode + alnum: PASS');
}

function testTitleTokensDropsSingleChars() {
	// Bad case: single character 'x' should be dropped; 'the' kept.
	const tokens = titleTokens('x the a-bomb');
	assert.deepStrictEqual(new Set(tokens), new Set(['the', 'bomb']));
	console.log('[lint-content] titleTokens drops <2 chars: PASS');
}

function testTitleTokensJaccardPipeline() {
	// Duplicate-signal worked example: two notes titled
	//   "Product Launch Plan (v2)" vs "Product Launch — Plan"
	// Both tokenize to {product, launch, plan, v2} vs {product, launch, plan}.
	// Intersection = 3, union = 4, jaccard = 0.75.
	const a = titleTokens('Product Launch Plan (v2)');
	const b = titleTokens('Product Launch — Plan');
	approx(jaccard(a, b), 0.75);
	console.log('[lint-content] title jaccard pipeline: PASS');
}

function testStrippedLengthDropsFrontmatterAndHeadings() {
	const content = '---\ntitle: Foo\ntags: [a, b]\n---\n# heading\n\nBody prose here.';
	const stripped = strippedLength(content);
	// After stripping frontmatter + heading line: 'Body prose here.' (16 chars).
	assert.strictEqual(stripped, 'Body prose here.'.length);
	console.log('[lint-content] strippedLength: PASS');
}

function testStrippedWordCountCountsWords() {
	const content = '# title\n\nAlpha beta gamma delta.';
	assert.strictEqual(strippedWordCount(content), 4);
	console.log('[lint-content] strippedWordCount: PASS');
}

function testStrippedWordCountEmptyProse() {
	// Bad case: only headings/frontmatter → 0 words.
	const content = '---\nfoo: bar\n---\n# heading only';
	assert.strictEqual(strippedWordCount(content), 0);
	console.log('[lint-content] strippedWordCount empty prose: PASS');
}

function testDetectNamingViolationEmpty() {
	assert.deepStrictEqual(detectNamingViolation(''), { reason: 'empty basename' });
	console.log('[lint-content] naming empty: PASS');
}

function testDetectNamingViolationLeadingTrailingWhitespace() {
	assert.deepStrictEqual(
		detectNamingViolation(' Foo'),
		{ reason: 'basename has leading or trailing whitespace' },
	);
	assert.deepStrictEqual(
		detectNamingViolation('Foo\t'),
		{ reason: 'basename has leading or trailing whitespace' },
	);
	console.log('[lint-content] naming whitespace: PASS');
}

function testDetectNamingViolationUntitledPlaceholder() {
	assert.deepStrictEqual(
		detectNamingViolation('Untitled'),
		{ reason: `default placeholder name 'Untitled'` },
	);
	assert.deepStrictEqual(
		detectNamingViolation('Untitled 3'),
		{ reason: `default placeholder name 'Untitled 3'` },
	);
	console.log('[lint-content] naming Untitled: PASS');
}

function testDetectNamingViolationAcceptsRegularNames() {
	assert.strictEqual(detectNamingViolation('Untitled ideas'), null,
		'Only exact Untitled + optional counter is flagged');
	assert.strictEqual(detectNamingViolation('kebab-case-note'), null);
	assert.strictEqual(detectNamingViolation('中文标题'), null);
	console.log('[lint-content] naming regular names: PASS');
}

function testHasFrontmatterDetectsLeadingBlock() {
	assert.strictEqual(hasFrontmatter('---\nfoo: bar\n---\nbody'), true);
	assert.strictEqual(hasFrontmatter('body only'), false);
	// Bad case: horizontal rule "---" in the body must not be mistaken for the closer.
	assert.strictEqual(hasFrontmatter('---\n---\nbody'), false);
	console.log('[lint-content] hasFrontmatter: PASS');
}

testJaccardEmptyPair();
testJaccardWorkedExample();
testJaccardDisjointIsZero();
testJaccardIdenticalIsOne();
testTitleTokensLowercaseAlnumMinTwo();
testTitleTokensDropsSingleChars();
testTitleTokensJaccardPipeline();
testStrippedLengthDropsFrontmatterAndHeadings();
testStrippedWordCountCountsWords();
testStrippedWordCountEmptyProse();
testDetectNamingViolationEmpty();
testDetectNamingViolationLeadingTrailingWhitespace();
testDetectNamingViolationUntitledPlaceholder();
testDetectNamingViolationAcceptsRegularNames();
testHasFrontmatterDetectsLeadingBlock();
