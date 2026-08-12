import assert from 'assert';
import { readFileSync } from 'fs';

const copilot = readFileSync('src/ui/view/composer/sidecar/CopilotView.tsx', 'utf8');
const related = readFileSync('src/ui/view/composer/sidecar/RelatedMaterialsModal.tsx', 'utf8');
const css = readFileSync('src/styles/composer-sidecar.css', 'utf8');
const productCss = readFileSync('src/styles/peak-components.css', 'utf8');

assert.ok(copilot.includes('pk-session-start'), 'a new Copilot session has a non-empty start state');
assert.ok(copilot.includes('pk-session-suggestion'), 'the start state offers concrete capability suggestions');
assert.ok(copilot.includes('pk-session-quick-actions'), 'real projected capabilities appear above the input');
assert.ok(copilot.includes('pk-capability-dialog'), 'all capabilities opens a real dialog');
assert.ok(copilot.includes('pk-capability-search'), 'the capability dialog can be searched');
assert.ok(copilot.includes('role="dialog"'), 'the capability browser has modal semantics');
assert.equal(
	copilot.includes('<details className="pk-capability-picker">'),
	false,
	'the all-capabilities control must not regress to the tiny empty details popover',
);
assert.ok(copilot.includes('<AIInstructionComposer'), 'the prompt uses the shared instruction capability');
assert.ok(copilot.includes('source: \'automatic\''), 'the prompt marks document context as automatic');
assert.ok(copilot.includes('formatCopilotContextLabel'), 'the prompt displays concise body context');
assert.ok(copilot.includes('<CopilotModelSelector'), 'the prompt retains a task-local model selector');
assert.ok(
	copilot.includes('buildProfileModelItems(profiles)'),
	'the model selector reuses the shared profile-qualified catalog rather than duplicating model data',
);
assert.equal(
	copilot.includes("@/ui/view/chat-view/components/composer/ComposerModelSelector"),
	false,
	'the prompt does not import protected Chat Composer UI',
);
assert.ok(copilot.includes('capabilityProjection.invoke('), 'capability choices execute through the real Composer projection port');
assert.ok(copilot.includes('candidateRuntime.onRunEvent'), 'session receipts follow real capability run events');
assert.match(
	css,
	/\.pk-capability-dialog-backdrop\s*\{[\s\S]*?align-items:\s*stretch;/,
	'the capability browser occupies the session surface instead of opening as a bottom sheet',
);
assert.match(
	css,
	/\.pk-capability-row-icon > svg\s*\{[\s\S]*?width:\s*14px;[\s\S]*?height:\s*14px;/,
	'capability icons keep the compact design scale',
);
assert.match(
	css,
	/\.peak-design-root \.pk-capability-search input\s*\{[\s\S]*?background:\s*transparent !important;/,
	'the capability search input stays integrated with its single search field shell',
);
assert.equal(
	/\.pk-session-start\s*\{[\s\S]*?margin:\s*auto 0;/.test(css),
	false,
	'the starter content must remain top-aligned instead of floating in a large blank middle',
);
assert.match(
	productCss,
	/\.pk-ai-instruction-context\s*\{[\s\S]*?flex-wrap:\s*wrap;/,
	'the shared context shelf remains readable without leaking into the prompt body',
);

assert.ok(related.includes('<InspectorSidePanel'), 'the material explorer reuses the Search-style inspector');
assert.ok(related.includes('showSearchSnippet={false}'), 'the Search inspector does not duplicate the row explanation');
assert.ok(
	related.includes('snippetText={snapshot.reasonBySourceId[item.id] || undefined}'),
	'the reason for relevance replaces the normal search-result snippet',
);
assert.ok(related.includes('bringIntoSession'), 'a selected source can be carried into Copilot');
assert.match(
	css,
	/\.pk-related-modal\.pk-modal-shell\[data-state\]\s*\{[\s\S]*?width:\s*var\(--pk-result-browser-frame-width\);[\s\S]*?max-width:\s*var\(--pk-result-browser-frame-max-width\);/,
	'the desktop material explorer matches the production Quick Search frame',
);
assert.ok(related.includes('ResultBrowserSearchInput'), 'the material explorer reuses the Quick Search query-field primitive');
assert.ok(related.includes('ResultBrowserFooterHints'), 'the material explorer reuses the Search keyboard contract');
assert.ok(related.includes("event.key === 'ArrowRight'"), 'right arrow opens the on-demand inspector');
assert.ok(related.includes("event.key === 'ArrowLeft'"), 'left arrow closes the on-demand inspector');
assert.ok(related.includes('ResultBrowserViewToggle'), 'the material browser preserves List / Tree / Graph views');
assert.ok(related.includes('<ResultBrowserTree'), 'the material browser preserves the shared Tree projection');
assert.ok(related.includes('<ResultBrowserGraph'), 'the material browser preserves the shared Graph projection');
assert.ok(
	related.indexOf('pk-related-search-row') < related.indexOf('pk-related-toolbar'),
	'the query field occupies its own row above the density toolbar',
);
assert.ok(related.includes('openOnSelect={false}'), 'body clicks select material for preview instead of navigating away');

console.log('composer-sidecar-session-interaction: passed');
