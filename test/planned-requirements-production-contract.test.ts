import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

function source(relativePath: string): string {
	return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const contextualPort = source('src/core/ports/ContextualGraphPort.ts');
const vaultSegment = source('src/ui/view/copilot/vault/VaultMaintenanceSegment.tsx');
const documentStrip = source('src/ui/view/copilot/context/DocumentContextGraphStrip.tsx');
const hubDrawer = source('src/ui/view/quick-search/components/inspector/HubSection.tsx');
const ambientHost = source('src/app/ambient/AmbientFloatingPanelHost.tsx');
const ambientPanel = source('src/ui/view/ambient-panel/RelatedNotesPanel.tsx');
const productCss = source('src/styles/peak-components.css');
const atlasHost = source('src/app/file-atlas/composeFileAtlasHost.ts');
const atlasBar = source('src/ui/view/file-atlas/components/AtlasBar.tsx');
const nativeModal = source('src/app/composer/NativeMarkdownIntelligenceModal.tsx');
const sharedComposer = source('src/ui/component/instruction-composer/AIInstructionComposer.tsx');
const quickSearch = source('src/ui/view/quick-search/SearchModal.tsx');
const quickStore = source('src/ui/view/quick-search/store/sharedStore.ts');
const graphRuntime = source('src/service/ai-graph/AIGraphArtifactRuntime.ts');
const graphRepository = source('src/service/ai-graph/AIGraphArtifactRepository.ts');
const graphEvents = source('src/app/ai-graph/ObsidianAIGraphRunEventStore.ts');
const graphProjection = source('src/app/ai-graph/SqliteAIGraphProjection.ts');
const folderModel = source('src/ui/component/graph/folderCompoundModel.ts');

assert.match(contextualPort, /loadDocumentContext/);
assert.match(vaultSegment, /Vault graph overview/);
assert.match(documentStrip, /Local graph/);
assert.match(hubDrawer, /hub\.status === 'primary'/);
assert.match(hubDrawer, /candidate/);
assert.match(hubDrawer, /orphanStatus/);

assert.match(ambientHost, /ReactRenderer/);
assert.match(ambientHost, /workspaceEl\.appendChild/);
assert.match(ambientPanel, /triggerManual/);
assert.match(productCss, /\.peak-ambient-floating-host[\s\S]*position:\s*fixed/);

assert.match(atlasHost, /getMostUsed/);
assert.match(atlasHost, /loadCopilotSuggestions/);
assert.match(atlasHost, /openAIGraphs/);
assert.match(atlasBar, /onFlattenChange/);
assert.match(atlasBar, /aria-label=\{config\.strings\.filtersButton\}/);

assert.match(nativeModal, /Copilot/);
assert.match(nativeModal, /History/);
assert.doesNotMatch(nativeModal, /tabAmbient/);
assert.match(nativeModal, /tryGetDocumentComposerRuntime/);

for (const consumer of [
	'src/ui/view/chat-view/components/Composer.tsx',
	'src/ui/view/composer/sidecar/CopilotView.tsx',
	'src/ui/view/quick-search/SearchModal.tsx',
]) {
	assert.match(source(consumer), /instruction-composer|AIInstructionComposer/);
}
assert.match(sharedComposer, /PromptInputBody/);
assert.match(sharedComposer, /createAIInstructionSubmission/);

assert.match(quickSearch, /AI_WORKSPACE_OPTIONS/);
assert.match(quickSearch, /AIGraphHistoryPanel/);
assert.doesNotMatch(quickSearch, /event\.key === 'Tab'/);
assert.match(quickStore, /beginOrdinaryOpen/);
assert.match(quickStore, /aiGraphDeepLinkId/);

assert.match(graphRuntime, /proposeUpdate/);
assert.match(graphRuntime, /acceptUpdate/);
assert.match(graphRuntime, /replaceSources/);
assert.match(graphRepository, /writeNewVersion/);
assert.match(graphEvents, /\.jsonl/);
assert.match(graphProjection, /ai_graph_artifact_projection/);
assert.match(quickSearch, /Use source changes in Update graph/);
assert.match(quickSearch, /listAIGraphVersions/);

assert.match(folderModel, /directFolders/);
assert.match(folderModel, /parentPath/);

console.log('PASS: all planned requirements have production composition contracts');
