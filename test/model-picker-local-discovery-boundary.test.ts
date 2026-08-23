import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const discovery = read('src/app/model-catalog/ModelCatalogRuntime.ts');
const lmStudioDiscovery = read('src/core/providers/lmstudio/fetchLMStudioModels.ts');
const ollamaDiscovery = read('src/core/providers/ollama/fetchOllamaModels.ts');
const chatPicker = read('src/ui/view/chat-view/components/composer/ComposerModelSelector.tsx');
const settingsRoot = read('src/ui/view/SettingsView.tsx');
const aiModels = read('src/ui/view/settings/tabs/AIModelsTab.tsx');
const agents = read('src/ui/view/settings/tabs/AgentsTab.tsx');
const knowledge = read('src/ui/view/settings/tabs/KnowledgeSearchTab.tsx');
const appContext = read('src/app/context/AppContext.ts');
const legacyModelsHook = read('src/ui/hooks/useModels.ts');

assert.match(discovery, /'ollama', 'lmstudio', 'openrouter'/, 'runtime catalog refresh must include OpenRouter embedding discovery');
assert.match(discovery, /fetchOpenRouterModels/, 'OpenRouter must use the authenticated complete user catalog');
assert.match(discovery, /replaceRuntimeModels/, 'dynamic catalogs must replace stale snapshots rather than append forever');
assert.match(discovery, /profileModelCatalogId\(profile\)/);
assert.match(discovery, /registry\.replaceRuntimeModels\(catalogId, models\)/);
assert.match(lmStudioDiscovery, /getProviderCorsBypassFetch\(\) \?\? fetch/, 'LM Studio discovery must use Obsidian\'s registered CORS-safe transport');
assert.match(lmStudioDiscovery, /\/api\/v1\/models/, 'LM Studio discovery must prefer the native list because it declares each model type');
assert.match(lmStudioDiscovery, /model\.type === 'embedding'/, 'LM Studio embedding eligibility must come from the server response');
assert.match(ollamaDiscovery, /getProviderCorsBypassFetch\(\) \?\? fetch/, 'Ollama discovery must use Obsidian\'s registered CORS-safe transport');
assert.match(ollamaDiscovery, /\/api\/show/, 'Ollama discovery must read server-declared embedding capability instead of guessing from the model id');
assert.match(ollamaDiscovery, /capabilities\?\.includes\('embedding'\)/, 'Ollama embedding eligibility must come from the server response');
assert.match(appContext, /'embedding-refresh': route\(embedding, candidatesFor\(ModelType\.EMBEDDING\), ModelType\.EMBEDDING\)/, 'the Scan embedding route must receive its model type so a sole compatible embedding model can be auto-selected');
assert.match(appContext, /'file-summaries': route\(agent, candidatesFor\(ModelType\.LLM\), ModelType\.LLM\)/, 'the Scan text route must receive its model type and preserve a valid bound chat model');
assert.match(chatPicker, /useModelCatalog\(resolvedProfiles\)/, 'Chat Studio must subscribe to and refresh through the shared runtime');
assert.match(chatPicker, /useModelCatalog\(resolvedProfiles\)/, 'a completed discovery must rerender through the shared subscription');
assert.match(legacyModelsHook, /useModelCatalog\(ProfileRegistry\.getInstance\(\)\.getAllProfiles\(\)\)/, 'legacy message metadata must react to the same catalog revision');

for (const relativePath of [
	'src/ui/view/settings/tabs/AIModelsTab.tsx',
	'src/ui/view/settings/ProfilesTab.tsx',
	'src/ui/view/chat-view/components/composer/ComposerModelSelector.tsx',
	'src/ui/view/modals/harness-onboarding/BootstrapModelStep.tsx',
]) {
	const source = read(relativePath);
	assert.doesNotMatch(source, /fetch(OpenRouter|Ollama|LMStudio)|refreshLocalProfileModelCatalogs|modelRegistry/, `${relativePath} must not own model discovery or registry mutation`);
}

assert.match(settingsRoot, /closest\('\.modal-content'\)/, 'Settings must locate its Obsidian modal boundary');
assert.match(settingsRoot, /modelPickerPortal=\{modelPickerPortal\}/, 'all Settings model tabs must receive the modal-local portal');
assert.match(aiModels, /portalContainer=\{modelPickerPortal\}/, 'AI & Models pickers must stay inside the modal');
assert.match(agents, /portalContainer=\{modelPickerPortal\}/, 'Agent picker must stay inside the modal');
assert.match(knowledge, /portalContainer=\{modelPickerPortal\}/, 'Knowledge picker must stay inside the modal');

console.log('PASS model-picker-local-discovery-boundary');
