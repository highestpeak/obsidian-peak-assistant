import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resetQuickSearchPluginSession } from '../src/app/search/resetQuickSearchPluginSession';
import { useAIGraphStore } from '../src/ui/view/quick-search/store/aiGraphStore';
import { useSearchSessionStore } from '../src/ui/view/quick-search/store/searchSessionStore';
import { useSharedStore } from '../src/ui/view/quick-search/store/sharedStore';
import { useVaultSearchStore } from '../src/ui/view/quick-search/store/vaultSearchStore';

useSharedStore.setState({
	activeTab: 'ai',
	aiWorkspaceMode: 'graph',
	vaultSearchQuery: 'stale vault draft',
	searchQuery: 'stale AI draft',
	recentQueries: ['stale AI draft'],
});
useSearchSessionStore.setState({
	id: 'run:stale',
	query: 'stale AI draft',
	status: 'completed',
	webEnabled: true,
});
useAIGraphStore.setState({
	query: 'stale graph query',
	loading: true,
	selectedPaths: ['stale.md'],
});
useVaultSearchStore.setState({
	resultView: 'graph',
	isSearching: true,
	lastSearchDuration: 42,
});

resetQuickSearchPluginSession();

assert.equal(useSharedStore.getState().activeTab, 'vault');
assert.equal(useSharedStore.getState().aiWorkspaceMode, 'search');
assert.equal(useSharedStore.getState().vaultSearchQuery, '');
assert.equal(useSharedStore.getState().searchQuery, '');
assert.deepEqual(useSharedStore.getState().recentQueries, []);
assert.equal(useSearchSessionStore.getState().id, null);
assert.equal(useSearchSessionStore.getState().query, '');
assert.equal(useSearchSessionStore.getState().status, 'idle');
assert.equal(useSearchSessionStore.getState().webEnabled, false);
assert.equal(useAIGraphStore.getState().query, '');
assert.equal(useAIGraphStore.getState().loading, false);
assert.deepEqual(useAIGraphStore.getState().selectedPaths, []);
assert.equal(useVaultSearchStore.getState().resultView, 'list');
assert.equal(useVaultSearchStore.getState().isSearching, false);
assert.equal(useVaultSearchStore.getState().lastSearchDuration, null);

const main = readFileSync('main.ts', 'utf8');
const onloadStart = main.indexOf('async onload()');
const onunloadStart = main.indexOf('async onunload()');
const onloadBody = main.slice(onloadStart, onunloadStart);
const onunloadBody = main.slice(onunloadStart);

assert.ok(onloadStart >= 0 && onunloadStart > onloadStart);
assert.ok(
	onloadBody.indexOf('resetQuickSearchPluginSession()') < onloadBody.indexOf('await '),
	'new plugin sessions must clear stale Quick Search memory before asynchronous startup',
);
assert.ok(
	onunloadBody.indexOf('resetQuickSearchPluginSession()')
		< onunloadBody.indexOf('await this.searchUpdateQueue.dispose()'),
	'plugin unload must clear Quick Search memory synchronously before waiting for index shutdown',
);

console.log('quick-search-plugin-session-lifecycle: passed');
