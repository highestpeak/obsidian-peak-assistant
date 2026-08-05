import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(
	join(__dirname, '..', 'src/styles/composer-sidecar.css'),
	'utf8',
);

assert.match(
	css,
	/\.pk-native-intelligence-modal \.pk-native-intelligence-shell\s*\{[\s\S]*?display:\s*flex;[\s\S]*?height:\s*100%;[\s\S]*?flex-direction:\s*column;/,
	'the native Intelligence shell must occupy the modal instead of collapsing above a blank body',
);
assert.match(
	css,
	/\.pk-native-intelligence-modal \.pk-sidecar-anchor\[data-sidecar-mode='desktop'\]\[data-open='true'\]\s*\{[\s\S]*?width:\s*100%;[\s\S]*?flex:\s*1 1 auto;/,
	'the shared Intelligence sidecar must expand to the dedicated modal width',
);
assert.match(
	css,
	/\.pk-native-intelligence-modal \.pk-sidecar-anchor\[data-sidecar-mode='desktop'\]\[data-open='true'\] > \.pk-sidecar\s*\{[\s\S]*?width:\s*100%;[\s\S]*?margin:\s*0;/,
	'the embedded sidecar must not retain Composer desktop-column margins',
);
assert.match(
	css,
	/\.pk-native-intelligence-modal \.pk-sidecar-anchor\[data-sidecar-mode='drawer'\]\s*\{[\s\S]*?position:\s*relative;[\s\S]*?width:\s*100%;[\s\S]*?flex:\s*1 1 auto;/,
	'the modal is narrower than the shared sidecar breakpoint, so drawer mode must become in-flow content',
);
assert.match(
	css,
	/\.pk-native-intelligence-modal \.pk-sidecar-anchor\[data-sidecar-mode='drawer'\] > \.pk-sidecar-drawer\s*\{[\s\S]*?position:\s*relative;[\s\S]*?width:\s*100%;[\s\S]*?height:\s*100%;/,
	'the narrow-mode drawer must fill the modal instead of becoming an off-canvas overlay',
);

console.log('PASS: native Markdown Intelligence modal owns a full-height sidecar layout');
