import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { containComposerEscape } from '@/ui/view/composer/escapeContainment';

interface FakeEvent {
	key: string;
	defaultPrevented: boolean;
	prevented: number;
	stopped: number;
	preventDefault(): void;
	stopPropagation(): void;
}

function event(key: string, defaultPrevented = false): FakeEvent {
	return {
		key,
		defaultPrevented,
		prevented: 0,
		stopped: 0,
		preventDefault() {
			this.defaultPrevented = true;
			this.prevented += 1;
		},
		stopPropagation() {
			this.stopped += 1;
		},
	};
}

const escape = event('Escape');
containComposerEscape(escape);
assert.equal(escape.prevented, 1, 'bare Escape should cancel the host default');
assert.equal(escape.stopped, 1, 'bare Escape should not reach Obsidian workspace handlers');

const handledEscape = event('Escape', true);
containComposerEscape(handledEscape);
assert.equal(handledEscape.prevented, 0, 'an internally handled Escape should stay handled');
assert.equal(handledEscape.stopped, 1, 'handled Escape must still remain inside Composer');

const enter = event('Enter');
containComposerEscape(enter);
assert.equal(enter.prevented, 0, 'non-Escape keys should keep their default behavior');
assert.equal(enter.stopped, 0, 'non-Escape keys should keep bubbling');

const rootSource = readFileSync('src/ui/view/composer/ComposerRoot.tsx', 'utf8');
assert.match(
	rootSource,
	/onKeyDown=\{containComposerEscape\}/,
	'ComposerRoot must attach Escape containment at the product-view boundary',
);

const viewSource = readFileSync('src/app/composer/DocumentComposerView.ts', 'utf8');
assert.match(
	viewSource,
	/this\.scope\.register\(\[\], 'Escape', \(\) => false\)/,
	'the Composer ItemView scope must own bare Escape before the workspace navigation scope',
);

console.log('composer-escape-containment: 8/8 checks passed');
