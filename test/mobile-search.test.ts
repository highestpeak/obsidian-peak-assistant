import { tokenizeQuery, scorePath, scoreContent } from '../src/service/search/MobileSearchService';

function runTests() {
	let passed = 0;
	let failed = 0;

	function assert(condition: boolean, message: string) {
		if (condition) {
			passed++;
		} else {
			failed++;
			console.error(`FAIL: ${message}`);
		}
	}

	// --- tokenizeQuery ---
	const tokens1 = tokenizeQuery('machine learning basics');
	assert(tokens1.length === 3, `Expected 3 tokens, got ${tokens1.length}`);
	assert(
		tokens1.includes('machine') && tokens1.includes('learning') && tokens1.includes('basics'),
		`Expected [machine, learning, basics], got [${tokens1}]`,
	);

	const tokens2 = tokenizeQuery('  the  a  an  ');
	assert(tokens2.length === 0, `Stopwords should be filtered, got ${tokens2.length}: [${tokens2}]`);

	const tokens3 = tokenizeQuery('');
	assert(tokens3.length === 0, `Empty string should produce 0 tokens, got ${tokens3.length}`);

	const tokens4 = tokenizeQuery('Hello, World!');
	assert(tokens4.length === 2, `Expected 2 tokens from "Hello, World!", got ${tokens4.length}`);
	assert(tokens4[0] === 'hello', `Expected lowercase "hello", got "${tokens4[0]}"`);

	const tokens5 = tokenizeQuery('is it to be or this that');
	assert(tokens5.length === 0, `All stopwords should be filtered, got ${tokens5.length}`);

	// --- scorePath ---
	const s1 = scorePath('notes/machine-learning/basics.md', ['machine', 'learning']);
	assert(s1 > 0, `Path containing query tokens should score > 0, got ${s1}`);

	const s2 = scorePath('notes/cooking/recipe.md', ['machine', 'learning']);
	assert(s2 === 0, `Unrelated path should score 0, got ${s2}`);

	// Filename match should score higher than directory match
	const s3 = scorePath('notes/machine-learning.md', ['machine']);
	const s4 = scorePath('machine/notes.md', ['machine']);
	assert(
		s3 > s4,
		`Filename match (${s3}) should score higher than dir-only match (${s4})`,
	);

	// Filename match = 3 points per token
	const s5 = scorePath('machine-learning.md', ['machine', 'learning']);
	assert(s5 === 6, `Two filename matches should be 6 points, got ${s5}`);

	// Directory match = 1 point per token
	const s6 = scorePath('machine/learning/notes.md', ['machine', 'learning']);
	assert(s6 === 2, `Two directory-only matches should be 2 points, got ${s6}`);

	// Mixed: one in filename, one in directory
	const s7 = scorePath('machine/learning.md', ['machine', 'learning']);
	assert(s7 === 4, `Dir(1) + filename(3) = 4 points, got ${s7}`);

	// --- scoreContent ---
	const c1 = scoreContent('Machine learning is a subset of AI.', ['machine', 'learning']);
	assert(c1 > 0, `Content with matches should score > 0, got ${c1}`);
	assert(c1 === 2, `Two token matches should score 2, got ${c1}`);

	const c2 = scoreContent('This document is about cooking recipes.', ['machine', 'learning']);
	assert(c2 === 0, `No-match content should score 0, got ${c2}`);

	// Multiple occurrences
	const c3 = scoreContent('learn learning learned learner', ['learn']);
	assert(c3 === 4, `"learn" appears 4 times (as substring), got ${c3}`);

	// Case insensitivity
	const c4 = scoreContent('MACHINE LEARNING', ['machine']);
	assert(c4 === 1, `Case-insensitive match should work, got ${c4}`);

	// Empty
	const c5 = scoreContent('', ['machine']);
	assert(c5 === 0, `Empty content should score 0, got ${c5}`);

	const c6 = scoreContent('some content', []);
	assert(c6 === 0, `Empty tokens should score 0, got ${c6}`);

	// Summary
	console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed} assertions`);
	if (failed > 0) {
		process.exit(1);
	}
	console.log('All mobile search tests passed!');
}

runTests();
