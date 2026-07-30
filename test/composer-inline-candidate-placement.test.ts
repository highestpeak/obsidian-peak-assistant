import assert from 'assert';
import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.join(process.cwd(), 'src/ui/view/composer/ComposerRoot.tsx'), 'utf8');
const inlineCandidate = source.indexOf('pk-composer-candidate-slot--in-place');
const belowCandidate = source.indexOf('pk-composer-candidate-slot--below');
const anchoredCandidate = source.indexOf('pk-composer-list__candidate-row');
const blockBody = source.indexOf('<BlockBody');
const actionRow = source.indexOf('<BlockActionRow');

assert.ok(inlineCandidate >= 0, 'rewrite candidates must have a dedicated in-place slot');
assert.ok(belowCandidate >= 0, 'additive candidates must have a dedicated below-source slot');
assert.ok(anchoredCandidate >= 0, 'list-item candidates must have a true in-list insertion slot');
assert.ok(blockBody >= 0, 'Composer block still needs its normal body renderer');
assert.ok(actionRow >= 0, 'Composer block action row must remain after the content surface');
assert.ok(inlineCandidate < blockBody, 'rewrite candidates must occupy the source-body position');
assert.ok(belowCandidate > blockBody, 'additive drafts must render after the unchanged source body');
assert.ok(
	source.includes("effect === 'insert' || effect === 'transform'"),
	'additive and structural candidates must share the below-source review rail',
);
assert.ok(
	source.includes("candidateRuntime?.candidateEffectFor?.(item.candidateId) === 'rewrite'"),
	'only rewrite effects may replace the source-body position',
);
assert.ok(
	source.includes('COMPOSER_LIST_ITEM_PATCH_RENDERER_ID'),
	'anchored list-item placement must dispatch on its typed renderer contract',
);
assert.ok(
	source.includes('{editing && !showInlineCandidate && ('),
	'action row must only hide when an inline candidate is actually visible',
);

console.log('composer-inline-candidate-placement: passed');
