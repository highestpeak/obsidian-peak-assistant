import assert from 'assert';
import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.join(process.cwd(), 'src/ui/view/composer/ComposerRoot.tsx'), 'utf8');
const inlineCandidate = source.indexOf('pk-composer-candidate-slot--in-place');
const blockBody = source.indexOf('<BlockBody');
const actionRow = source.indexOf('<BlockActionRow');

assert.ok(inlineCandidate >= 0, 'a pending candidate must have a dedicated in-place slot');
assert.ok(blockBody >= 0, 'Composer block still needs its normal body renderer');
assert.ok(actionRow >= 0, 'Composer block action row must remain after the content surface');
assert.ok(inlineCandidate < blockBody, 'pending candidate must replace the source body, not render below it');
assert.ok(inlineCandidate < actionRow, 'candidate review must stay in the body position before block chrome');
assert.ok(source.includes('{editing && !hasInlineCandidate && ('), 'pending candidate must own the review controls without a duplicate block action row');
assert.equal(source.includes('candidateRuntime && candidateId && (\n\t\t\t\t\t\t<div className="pk-composer-candidate-slot"'), false, 'legacy below-body candidate slot must be removed');

console.log('composer-inline-candidate-placement: passed');
