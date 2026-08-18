import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function source(path: string): string {
	return readFileSync(path, 'utf8');
}

const workspace = source('src/ui/view/vault-intelligence/VaultIntelligenceWorkspace.tsx');
const runtime = source('src/app/vault-intelligence/VaultIntelligenceRuntime.ts');
const model = source('src/ui/view/vault-intelligence/VaultIntelligenceModel.ts');
const view = source('src/app/ui-host/views/VaultIntelligenceView.tsx');
const viewManager = source('src/app/ui-host/views/ViewManager.ts');
const quickSearch = source('src/ui/view/quick-search/SearchModal.tsx');
const main = source('main.ts');
const outputs = source('src/core/storage/generated-output/catalog/vaultIntelligenceOutputs.ts');
const config = source('templates/config/vault-intelligence.json');

assert.match(view, /class VaultIntelligenceView extends ReactItemViewHost/);
assert.match(view, /VAULT_INTELLIGENCE_VIEW_TYPE/);
assert.match(viewManager, /activateVaultIntelligenceView/);
assert.match(main, /openVaultIntelligence: \(\) => this\.viewManager\.activateVaultIntelligenceView\(\)/);

assert.match(workspace, /\['overview', 'Overview'\]/);
assert.match(workspace, /\['map', 'Vault map'\]/);
assert.match(workspace, /\['queue', 'Work queue'\]/);
assert.doesNotMatch(workspace, /\['runs', 'Runs'\]/);
assert.match(workspace, /AtlasGraphCanvas/);
assert.match(workspace, /preset=\{preset\}/);
assert.match(workspace, /Constellation/);
assert.match(workspace, /Flow/);
assert.match(workspace, /Orbit/);
assert.doesNotMatch(workspace, /preset === 'community'/);
assert.doesNotMatch(workspace, /<aside className="pk-vi-card pk-vi-selection"/);
assert.match(workspace, /Recorded local timestamps and receipts\. AI themes are not inferred/);
assert.match(workspace, /mapSurface: 'activity'/);
assert.match(workspace, /periodReceiptCount/);
assert.match(workspace, /Changed objects/);
assert.match(workspace, /disabled=\{id === 'changed' && !snapshot\.changedCursorAt\}/);
assert.match(workspace, /Selected scope/);
assert.match(workspace, /Entire Vault/);
assert.match(workspace, /same canonical decisions/);
assert.match(workspace, /No Markdown or YAML changes during this step/);
assert.match(workspace, /Successful machine work stays in Scan receipts/);
assert.match(workspace, /Completed automatically/);
assert.match(workspace, /Knowledge Index ready/);
assert.match(workspace, /File Property Review/);
assert.match(workspace, /Broken Link Review/);
assert.match(workspace, /Community Membership/);
assert.match(workspace, /Index Recovery/);
assert.match(workspace, /Review does not write YAML/);
assert.match(workspace, /this surface has not generated or applied a diff/);
assert.doesNotMatch(workspace, /Prepare review handoff/);
assert.match(workspace, /function CommunityPicker/);
assert.match(workspace, /Choose another Community/);
assert.doesNotMatch(workspace, /@xyflow\/react/);
assert.doesNotMatch(workspace, /<button/);

assert.match(runtime, /performDiscover/);
assert.match(runtime, /performIndex/);
assert.match(runtime, /performAi/);
assert.match(runtime, /performPublish/);
assert.match(runtime, /runCoreIndex/);
assert.match(runtime, /review\.run/);
assert.match(runtime, /saveReport/);
assert.match(runtime, /runMobiusGlobalMaintenance/);
assert.match(model, /deriveVaultMaintenanceTasks/);
assert.match(model, /digest\.communityLinks/);
assert.match(model, /verified-cross-community-reference/);
assert.match(runtime, /getFiles\(\)/);
assert.match(runtime, /enabledKinds\.has\(task\.kind\)/);
assert.match(runtime, /review decisions saved; user files unchanged/);
assert.match(runtime, /resolveOperationRoutes/);
assert.match(runtime, /calculateCostUsd/);
assert.match(workspace, /Unavailable/);
assert.match(workspace, /shared Vault Review run/);
assert.doesNotMatch(runtime, /writeFrontmatter|processFrontMatter|generateSummary|generateAiTags/i);

assert.match(outputs, /vault-intelligence\.state/);
assert.match(outputs, /vault-intelligence\.events/);
assert.match(outputs, /records\/vault-intelligence\/state\.json/);
assert.match(outputs, /records\/vault-intelligence\/events\.jsonl/);
assert.equal((config.match(/\"kind\":/g) ?? []).length, 11);
assert.equal((config.match(/\"checkId\":/g) ?? []).length, 19);
assert.equal((config.match(/\"id\": \"(?:connections|content|tags|aging)\"/g) ?? []).length, 4);
assert.equal((config.match(/\"id\": \"(?:embedding-refresh|file-summaries|ai-tags|relationship-review|community-analysis|file-proposals|maintenance-synthesis)\"/g) ?? []).length, 7);

assert.match(quickSearch, /onOpenVaultIntelligence/);
assert.doesNotMatch(quickSearch, /import .*VaultIntelligenceWorkspace/);

console.log('vault-intelligence-standalone-contract: passed');
