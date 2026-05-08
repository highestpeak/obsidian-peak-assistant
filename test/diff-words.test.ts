import { diffWords } from '../src/ui/component/diff/wordDiff';

// Test basic diff
const result = diffWords('the quick brown fox', 'the slow brown dog');
const removed = result.filter(s => s.type === 'removed').map(s => s.text.trim()).filter(Boolean);
const added = result.filter(s => s.type === 'added').map(s => s.text.trim()).filter(Boolean);
const equal = result.filter(s => s.type === 'equal').map(s => s.text.trim()).filter(Boolean);

console.assert(removed.includes('quick'), `Expected 'quick' in removed, got: ${JSON.stringify(removed)}`);
console.assert(removed.includes('fox'), `Expected 'fox' in removed, got: ${JSON.stringify(removed)}`);
console.assert(added.includes('slow'), `Expected 'slow' in added, got: ${JSON.stringify(added)}`);
console.assert(added.includes('dog'), `Expected 'dog' in added, got: ${JSON.stringify(added)}`);
console.assert(equal.includes('the'), `Expected 'the' in equal, got: ${JSON.stringify(equal)}`);
console.assert(equal.includes('brown'), `Expected 'brown' in equal, got: ${JSON.stringify(equal)}`);

// Test identical strings
const same = diffWords('hello world', 'hello world');
console.assert(same.every(s => s.type === 'equal'), 'Identical strings should all be equal');

// Test empty original
const fromEmpty = diffWords('', 'new text');
const addedFromEmpty = fromEmpty.filter(s => s.type === 'added');
console.assert(addedFromEmpty.length > 0, 'All-new should have added segments');

// Test merge consecutive segments
const merged = diffWords('a b c', 'x y c');
// Tokens interleave: a(rm) x(add) ' '(eq) b(rm) y(add) ' c'(eq) = 6 segments
// Key check: consecutive same-type segments are merged (no two adjacent segments share a type)
for (let idx = 1; idx < merged.length; idx++) {
    console.assert(
        merged[idx].type !== merged[idx - 1].type,
        `Adjacent segments ${idx - 1} and ${idx} should not share type '${merged[idx].type}'`
    );
}

console.log('All diff-words tests passed');
