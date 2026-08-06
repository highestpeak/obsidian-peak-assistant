import assert from 'assert';
import { readFileSync } from 'fs';

const source = (path: string): string => readFileSync(path, 'utf8');

const runtime = source('src/app/command-center/CommandCenterRuntime.ts');
const composition = source('src/app/command-center/composeCommandCenterRuntime.ts');
const hostContract = source('src/ui/view/quick-search/hooks/useQuickSearchHost.ts');
const hostComposition = source('src/app/search/composeQuickSearchHost.ts');
const inspector = source('src/ui/view/quick-search/components/inspector/InspectorSidePanel.tsx');
const inspectorHeader = inspector.slice(
	inspector.indexOf('{/* Sticky header */}'),
	inspector.indexOf('{/* Scrollable content'),
);
const pinControl = source('src/ui/view/quick-search/components/inspector/CommandCenterPinControl.tsx');
const connectedSection = source('src/ui/view/quick-search/components/inspector/ConnectedSection.tsx');
const discoveredSection = source('src/ui/view/quick-search/components/inspector/DiscoveredSection.tsx');
const aiGraphSection = source('src/ui/view/quick-search/components/inspector/AIGraphSection.tsx');
const searchModal = source('src/ui/view/quick-search/SearchModal.tsx');

for (const method of ['getVaultTargetMembership', 'setVaultTargetGroup', 'setVaultTargetHome', 'renameVaultTargets']) {
	assert.match(runtime, new RegExp(`${method}\\(`), `Command Center runtime must own ${method}`);
}
assert.match(composition, /app\.vault\.on\('rename'/, 'app composition must follow Vault file and folder renames');
assert.match(composition, /runtime\.renameVaultTargets\(oldPath, file\.path\)/);

for (const operation of [
	'getCommandCenterDocumentMembership',
	'setCommandCenterDocumentGroup',
	'setCommandCenterDocumentHome',
]) {
	assert.match(hostContract, new RegExp(`${operation}\\(`), `Quick Search host must expose ${operation}`);
	assert.match(hostComposition, new RegExp(`${operation}:`), `app composition must implement ${operation}`);
}
assert.doesNotMatch(pinControl, /AppContext|runtimeRegistry|saveConfig/, 'the UI control must consume named Quick Search host operations only');
assert.match(pinControl, /getCommandCenterDocumentMembership/);
assert.match(pinControl, /setCommandCenterDocumentGroup/);
assert.match(pinControl, /setCommandCenterDocumentHome/);
assert.doesNotMatch(pinControl, /handlePrimaryClick|defaultGroupId!/, 'opening the destination picker must not silently mutate the default group');
assert.match(pinControl, /Home · Recommended/, 'Home must be the first, recommended destination');
assert.match(pinControl, /role="checkbox"/);
assert.match(pinControl, /role="group"/, 'tabbable checkbox destinations must live inside an accessible labelled group');
assert.match(pinControl, /container=\{portalContainer\}/, 'the destination picker must stay inside the active Quick Search modal');
assert.match(pinControl, /pk-inspector-icon-button/, 'the pin must use the neutral Inspector icon-button state contract');
assert.match(pinControl, /geometry="toolbar-icon"/, 'inspector controls must opt into reset-safe toolbar geometry');
assert.match(pinControl, /aria-pressed=\{active\}/, 'the pin must expose membership across Home and tabs');

assert.match(inspector, /showCommandCenterPin\?: boolean/);
assert.match(inspector, /<CommandCenterPinControl path=\{currentPath\} portalContainer=\{portalContainer\}/);
assert.match(inspector, /pk-inspector-local-portal/, 'Inspector must own a modal-local portal for focus-contained menus');
assert.match(inspector, /pk-inspector-icon-button/g, 'all Inspector header actions must share one neutral hover contract');
assert.doesNotMatch(inspectorHeader, /pktw-text-pk-foreground-muted" \/>/, 'Inspector header SVGs must inherit currentColor instead of locking muted gray');
for (const section of [connectedSection, discoveredSection, aiGraphSection]) {
	assert.doesNotMatch(section, /variant="ghost"/, 'Inspector actions must not inherit the purple ghost hover contract');
}
assert.match(connectedSection, /pk-inspector-mini-icon-button/, 'connected-note inspection must use a neutral icon state');
assert.match(discoveredSection, /pk-inspector-mini-icon-button/, 'discovered-note inspection must use a neutral icon state');
assert.match(aiGraphSection, /pk-inspector-row-button/, 'AI Graph rows must use a neutral row state');
assert.match(searchModal, /showCommandCenterPin/, 'Vault Search inspector must explicitly opt into the Command Center affordance');

console.log('command-center-search-pin-boundary: passed');
