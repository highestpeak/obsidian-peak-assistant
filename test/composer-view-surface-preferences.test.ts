import assert from 'assert';
import { readFileSync } from 'fs';
import {
	initialIntelligencePresentationState,
	reduceIntelligencePresentation,
	type IntelligencePresentationOrigin,
} from '@/core/composer';
import { DEFAULT_SETTINGS } from '@/core/config/settingsTypes';

assert.equal(
	DEFAULT_SETTINGS.composer.intelligenceManualOpen,
	false,
	'new installs must start with Intelligence closed',
);

const automaticSuggestion: IntelligencePresentationOrigin = {
	kind: 'automatic-suggestion',
	findingId: 'finding-1',
	blockId: 'paragraph-1',
};

const initialClosed = initialIntelligencePresentationState(false);
assert.deepEqual(initialClosed, {
	open: false,
	manualPreference: false,
	origin: null,
	animate: false,
});

const contextualOpen = reduceIntelligencePresentation(initialClosed, {
	kind: 'contextual-open',
	origin: automaticSuggestion,
});
assert.equal(contextualOpen.open, true, 'contextual actions open the current sidecar');
assert.equal(contextualOpen.manualPreference, false, 'contextual actions never rewrite the manual preference');
assert.equal(contextualOpen.origin?.kind, 'automatic-suggestion', 'contextual origin stays attached');
assert.equal(contextualOpen.animate, true, 'a real closed-to-open interaction animates');

const manualClose = reduceIntelligencePresentation(contextualOpen, {
	kind: 'manual-set',
	open: false,
});
assert.equal(manualClose.open, false);
assert.equal(manualClose.manualPreference, false);
assert.equal(manualClose.origin, null, 'manual close clears transient origin');
assert.equal(manualClose.animate, true);

const restoredOpen = initialIntelligencePresentationState(true);
assert.equal(restoredOpen.open, true);
assert.equal(restoredOpen.manualPreference, true);
assert.equal(restoredOpen.animate, false, 'restored-open state never plays an entrance animation');

const manualOpen = reduceIntelligencePresentation(initialClosed, {
	kind: 'manual-set',
	open: true,
});
assert.equal(manualOpen.manualPreference, true, 'explicit open persists for later Composer leaves');
assert.equal(manualOpen.origin, null, 'plain toolbar open exposes no source label');

const root = readFileSync('src/ui/view/composer/ComposerRoot.tsx', 'utf8');
const sidecar = readFileSync('src/ui/view/composer/sidecar/IntelligenceSidecar.tsx', 'utf8');
const sidecarCss = readFileSync('src/styles/composer-sidecar.css', 'utf8');
const composerCss = readFileSync('src/styles/composer.css', 'utf8');
const settingsLoader = readFileSync('src/app/settings/PluginSettingsLoader.ts', 'utf8');
const undoRedoBar = readFileSync('src/ui/view/composer/chrome/UndoRedoBar.tsx', 'utf8');
const nativeAffordance = readFileSync(
	'src/app/composer/NativeMarkdownComposerAffordance.tsx',
	'utf8',
);

assert.match(root, /React\.useState\(false\)/, 'comments default closed in every new Composer mount');
assert.doesNotMatch(root, /useState\(true\).*intelligenceOpen|intelligenceOpen.*useState\(true\)/s);
assert.match(root, /initialIntelligenceOpen/, 'Intelligence initial state comes from app-owned preference');
assert.match(root, /contextual-open/, 'body suggestions and comment handoffs use contextual open');
assert.match(sidecar, /motion=\{/, 'sidecar receives explicit motion state instead of inferring mount motion');
assert.match(sidecar, /<SensingControl/, 'scope and update policy share the compact context row');
assert.match(
	sidecarCss,
	/pk-sidecar-anchor--user-transition/,
	'desktop width transitions are gated behind an explicit user-transition class',
);
assert.match(root, /onOpenNativeMarkdown/, 'Composer receives the current-leaf Native Markdown action');
assert.match(
	undoRedoBar,
	/onOpenNativeMarkdown=\{onOpenNativeMarkdown\}/,
	'the left display switch owns the visible Native Markdown action',
);
assert.doesNotMatch(
	undoRedoBar,
	/defaultDocumentView|futureLabel|pk-composer-default-view|onConvertCurrentView/,
	'future-open policy and the duplicate view switch must stay out of the Composer toolbar',
);
assert.match(nativeAffordance, /getLeavesOfType\('markdown'\)/);
assert.match(nativeAffordance, /<Button/);
assert.match(nativeAffordance, /convert\(leaf\)/);
assert.match(
	composerCss,
	/\.peak-design-root \.pk-native-composer-affordance__button[\s\S]*?height:\s*32px !important;[\s\S]*?min-height:\s*32px !important;[\s\S]*?max-height:\s*32px !important;[\s\S]*?padding:\s*0 10px !important;/,
	'native Markdown affordance defends its fixed hit target from the Obsidian reset',
);
assert.match(
	settingsLoader,
	/intelligenceManualOpen/,
	'persisted Composer preference is normalized during settings load',
);

console.log('composer-view-surface-preferences: passed');
