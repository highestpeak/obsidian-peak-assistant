import assert from 'assert';
import { readFileSync } from 'fs';

const source = (path: string): string => readFileSync(path, 'utf8');

const runtime = source('src/app/command-center/CommandCenterRuntime.ts');
const composition = source('src/app/command-center/composeCommandCenterRuntime.ts');
const hostContract = source('src/ui/view/quick-search/hooks/useQuickSearchHost.ts');
const hostComposition = source('src/app/search/composeQuickSearchHost.ts');
const inspector = source('src/ui/view/quick-search/components/inspector/InspectorSidePanel.tsx');
const pinControl = source('src/ui/view/quick-search/components/inspector/CommandCenterPinControl.tsx');
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
assert.match(pinControl, /defaultGroupId/, 'primary click must use the runtime-resolved default group');
assert.match(pinControl, /role="checkbox"/);
assert.match(pinControl, /role="group"/, 'tabbable checkbox destinations must live inside an accessible labelled group');
assert.match(pinControl, /Show on Home/, 'Home must remain an independent explicit choice');
assert.match(pinControl, /geometry="toolbar-icon"/, 'inspector controls must opt into reset-safe toolbar geometry');
assert.match(pinControl, /aria-pressed=\{membership\.configured\}/, 'the main pin must expose its configured state');

assert.match(inspector, /showCommandCenterPin\?: boolean/);
assert.match(inspector, /<CommandCenterPinControl path=\{currentPath\}/);
assert.match(searchModal, /showCommandCenterPin/, 'Vault Search inspector must explicitly opt into the Command Center affordance');

console.log('command-center-search-pin-boundary: passed');
