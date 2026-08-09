import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

function source(relativePath: string): string {
	return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const contextualPort = source('src/core/ports/ContextualGraphPort.ts');
const vaultWorkspace = source('src/ui/view/quick-search/VaultIntelligenceWorkspace.tsx');
const atlasPanel = source('src/ui/view/file-atlas/FileAtlasPanel.tsx');
const atlasInspector = source('src/ui/view/file-atlas/components/AtlasInspector.tsx');
const atlasInspectorModel = source('src/ui/view/file-atlas/atlasInspectorModel.ts');
const atlasGraph = source('src/ui/view/file-atlas/components/FileAtlasGraph.tsx');
const searchInspector = source('src/ui/view/quick-search/components/inspector/InspectorSidePanel.tsx');
const ambientPanel = source('src/ui/view/ambient-panel/RelatedNotesPanel.tsx');
const productCss = source('src/styles/peak-components.css');
const atlasHost = source('src/app/file-atlas/composeFileAtlasHost.ts');
const atlasBar = source('src/ui/view/file-atlas/components/AtlasBar.tsx');
const nativeModal = source('src/app/composer/NativeMarkdownIntelligenceModal.tsx');
const nativeContext = source('src/app/composer/NativeMarkdownIntelligenceContext.ts');
const sharedComposer = source('src/ui/component/instruction-composer/AIInstructionComposer.tsx');
const sharedController = source('src/core/instruction-composer/SharedAIInstructionController.ts');
const promptTrigger = source('src/ui/component/prompt-input/promptTrigger.ts');
const chatComposer = source('src/ui/view/chat-view/components/Composer.tsx');
const composerCopilot = source('src/ui/view/composer/sidecar/CopilotView.tsx');
const quickSearch = source('src/ui/view/quick-search/SearchModal.tsx');
const quickStore = source('src/ui/view/quick-search/store/sharedStore.ts');
const quickHost = source('src/app/search/composeQuickSearchHost.ts');
const graphRuntime = source('src/service/ai-graph/AIGraphArtifactRuntime.ts');
const graphRepository = source('src/service/ai-graph/AIGraphArtifactRepository.ts');
const graphStore = source('src/ui/view/quick-search/store/aiGraphStore.ts');
const searchSession = source('src/ui/view/quick-search/hooks/useSearchSession.ts');
const graphEvents = source('src/app/ai-graph/ObsidianAIGraphRunEventStore.ts');
const graphProjection = source('src/app/ai-graph/SqliteAIGraphProjection.ts');
const graphAgent = source('src/service/agents/AIGraphAgent.ts');
const graphContextArtifacts = source('src/ui/component/ai-graph/AIGraphContextArtifacts.tsx');
const contextualAIGraph = source('src/ui/component/ai-graph/ContextualAIGraphView.tsx');
const folderModel = source('src/ui/component/graph/folderTreeModel.ts');
const timelineLayout = source('src/ui/component/mine/multi-lens-graph/layouts/timeline-layout.ts');

assert.match(contextualPort, /loadDocumentContext/);
assert.match(vaultWorkspace, /Community overview/);
assert.match(vaultWorkspace, /Review work starts only from explicit actions/);
assert.doesNotMatch(vaultWorkspace, /Opening this mode never starts a scan/);
assert.doesNotMatch(atlasPanel, /FileAtlasDocumentContext|pkfa-document-context-slot/);
assert.match(atlasGraph, /data-graph-scope="one-hop"/);
assert.match(atlasGraph, /data-graph-scope="two-hop"/);
assert.match(atlasGraph, /data-graph-scope="ai"/);
assert.match(searchInspector, /Open in File Atlas/);
assert.doesNotMatch(searchInspector, /<HubSection/);

assert.doesNotMatch(ambientPanel, /floating\??:/);
assert.doesNotMatch(ambientPanel, /data-draggable/);
assert.doesNotMatch(ambientPanel, /triggerManual/);
assert.doesNotMatch(productCss, /\.peak-ambient-floating-host/);

assert.match(atlasHost, /getMostUsed/);
assert.match(atlasHost, /loadCopilotSuggestions/);
assert.match(atlasHost, /status: 'unavailable'/);
assert.match(atlasInspector, /AtlasQuickActions/);
assert.match(atlasInspector, /AtlasReviewSuggestions/);
assert.doesNotMatch(atlasInspector, /CopilotFindingGroup|ElementContextSection/);
assert.match(atlasInspector, /AIGraphContextArtifacts/);
assert.match(atlasInspectorModel, /groupAtlasCopilotSuggestions/);
assert.match(atlasHost, /getHubsForDoc/);
assert.match(atlasHost, /readManifest/);
assert.doesNotMatch(atlasHost, /openAIGraphs/);
assert.match(atlasBar, /onFlattenChange/);
assert.match(atlasBar, /aria-label=\{config\.strings\.filtersButton\}/);
assert.match(atlasBar, /onSavePreset/);
assert.match(atlasBar, /onResetPreset/);

assert.match(nativeModal, /Copilot/);
assert.match(nativeModal, /History/);
assert.doesNotMatch(nativeModal, /tabAmbient/);
assert.match(nativeModal, /tryGetDocumentComposerRuntime/);
assert.match(nativeModal, /Source revision/);
assert.match(nativeModal, /projection\.activeRunId/);
assert.match(nativeModal, /previouslyFocused\?\.focus/);
assert.match(nativeContext, /selectionText/);
assert.match(nativeContext, /headingAt/);

assert.match(chatComposer, /SharedAIInstructionController/);
assert.match(composerCopilot, /AIInstructionComposer/);
assert.match(quickSearch, /AIInstructionComposer/);
assert.match(sharedComposer, /PromptInputBody/);
assert.match(sharedComposer, /SharedAIInstructionController/);
assert.match(sharedComposer, /normalizeAIInstructionAttachments/);
assert.match(sharedController, /setComposing/);
assert.match(sharedController, /recent\(/);
assert.match(promptTrigger, /trigger: '@'/);
assert.match(promptTrigger, /'\[\['/);

assert.match(quickSearch, /AI_WORKSPACE_OPTIONS/);
assert.match(quickSearch, /VaultIntelligenceWorkspace/);
assert.doesNotMatch(quickSearch, /CopilotPickerContent/);
assert.match(quickSearch, /AIGraphHistoryPanel/);
assert.doesNotMatch(quickSearch, /event\.key === 'Tab'/);
assert.match(quickStore, /beginOrdinaryOpen/);
assert.match(quickStore, /aiGraphDeepLinkId/);

assert.match(graphRuntime, /proposeUpdate/);
assert.match(graphRuntime, /acceptUpdate/);
assert.match(graphRuntime, /replaceSources/);
assert.match(graphRuntime, /deactivateSource/);
assert.match(graphRuntime, /compareVersions/);
assert.match(graphRuntime, /restoreVersion/);
assert.match(graphRuntime, /duplicateVersion/);
assert.match(graphRuntime, /rebuildProjection/);
assert.match(graphRepository, /writeNewVersion/);
assert.match(graphStore, /exportAIGraphReferenceJson/);
assert.match(graphStore, /kind: 'ai-graph'/);
assert.doesNotMatch(
	graphStore.match(/exportAIGraphReferenceJson[\s\S]*?export const useAIGraphStore/)?.[0] ?? '',
	/lenses:\s*\{/,
);
assert.match(searchSession, /exportAIGraphReferenceJson/);
assert.match(searchSession, /setArtifactRef\(artifactRef\)/);
assert.match(graphEvents, /\.jsonl/);
assert.match(graphProjection, /ai_graph_artifact_projection/);
assert.match(quickSearch, /Use source changes in Update graph/);
assert.match(quickSearch, /listAIGraphVersions/);
assert.match(quickSearch, /Semantic diff/);
assert.match(quickHost, /reviewAIGraphRelation/);
assert.match(quickHost, /Web relations require a fetched Web source/);
assert.match(quickHost, /resolveAIGraphSourceContents/);
assert.match(graphAgent, /AIGraphArtifactExtract/);
assert.match(graphContextArtifacts, /graphVersionId: row\.versionId/);
assert.match(contextualAIGraph, /listAIGraphArtifacts/);
assert.match(contextualAIGraph, /Create AI Graph/);
assert.match(contextualAIGraph, /graphVersionId: row\.versionId/);
assert.match(timelineLayout, /No date \/ Unassigned/);

assert.match(folderModel, /buildVisibleFolderTree/);
assert.match(folderModel, /folderTreeSelectionScope/);
assert.match(folderModel, /toggleFolderTreeSelection/);

console.log('PASS: all planned requirements have production composition contracts');
