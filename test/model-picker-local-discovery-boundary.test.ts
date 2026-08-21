import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const discovery = read('src/core/providers/refreshLocalProfileModelCatalogs.ts');
const chatPicker = read('src/ui/view/chat-view/components/composer/ComposerModelSelector.tsx');
const settingsRoot = read('src/ui/view/SettingsView.tsx');
const aiModels = read('src/ui/view/settings/tabs/AIModelsTab.tsx');
const agents = read('src/ui/view/settings/tabs/AgentsTab.tsx');
const knowledge = read('src/ui/view/settings/tabs/KnowledgeSearchTab.tsx');

assert.match(discovery, /profile\.kind === 'ollama' \? fetchOllamaModels : fetchLMStudioModels/);
assert.match(discovery, /profileModelCatalogId\(profile\)/);
assert.match(discovery, /modelRegistry\.mergeRuntimeModels\(catalogId, modelIds\)/);
assert.match(chatPicker, /refreshLocalProfileModelCatalogs\(resolvedProfiles\)/, 'Chat Studio must refresh local models when its picker opens');
assert.match(chatPicker, /catalogRevision/, 'a completed discovery must rerender the model list');

assert.match(settingsRoot, /closest\('\.modal-content'\)/, 'Settings must locate its Obsidian modal boundary');
assert.match(settingsRoot, /modelPickerPortal=\{modelPickerPortal\}/, 'all Settings model tabs must receive the modal-local portal');
assert.match(aiModels, /portalContainer=\{modelPickerPortal\}/, 'AI & Models pickers must stay inside the modal');
assert.match(agents, /portalContainer=\{modelPickerPortal\}/, 'Agent picker must stay inside the modal');
assert.match(knowledge, /portalContainer=\{modelPickerPortal\}/, 'Knowledge picker must stay inside the modal');

console.log('PASS model-picker-local-discovery-boundary');
