import assert from 'node:assert/strict';
import { useSharedStore } from '../src/ui/view/quick-search/store/sharedStore';

const state = () => useSharedStore.getState();

state().reset();
assert.equal(state().activeTab, 'vault', 'a cold plugin runtime must start on Vault Search');
assert.equal(state().aiWorkspaceMode, 'search');

state().setAIWorkspaceMode('graph');
state().beginIntentOpen('graph', 'graph-1', 'version-2');
state().beginOrdinaryOpen();
assert.equal(state().activeTab, 'ai', 'ordinary reopen must preserve the session surface');
assert.equal(state().aiWorkspaceMode, 'graph', 'ordinary reopen must preserve the exact AI workspace');
assert.equal(state().aiGraphDeepLinkId, null, 'ordinary reopen must clear one-shot deep links');
assert.equal(state().aiGraphDeepLinkVersionId, null, 'ordinary reopen must clear one-shot version links');

state().setActiveTab('vault');
state().beginOrdinaryOpen();
assert.equal(state().activeTab, 'vault', 'closing on Vault Search must reopen on Vault Search');
assert.equal(state().aiWorkspaceMode, 'graph', 'the hidden AI workspace selection stays available in-session');

state().setAIWorkspaceMode('vault-intelligence');
state().beginOrdinaryOpen();
assert.equal(state().activeTab, 'ai');
assert.equal(state().aiWorkspaceMode, 'vault-intelligence');

state().reset();
assert.equal(state().activeTab, 'vault', 'plugin unload/reset must restore the cold-start surface');
assert.equal(state().aiWorkspaceMode, 'search', 'plugin unload/reset must restore the default AI submode');

console.log('quick-search-session-surface-state: passed');
