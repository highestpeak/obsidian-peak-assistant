import assert from 'node:assert/strict';
import { useVaultSearchStore } from '@/ui/view/quick-search/store/vaultSearchStore';

const store = useVaultSearchStore.getState();
store.reset();

assert.equal(useVaultSearchStore.getState().resultView, 'list');
assert.equal(useVaultSearchStore.getState().resultDensity, 'detailed', 'List starts Detailed');

store.setResultView('tree');
assert.equal(useVaultSearchStore.getState().resultDensity, 'compact', 'entering Tree defaults to Compact');

useVaultSearchStore.getState().setResultDensity('detailed');
assert.equal(useVaultSearchStore.getState().resultDensity, 'detailed', 'Tree still allows an explicit Detailed override');

useVaultSearchStore.getState().setResultView('graph');
assert.equal(useVaultSearchStore.getState().resultDensity, 'detailed', 'Graph preserves the hidden density while it is irrelevant');

useVaultSearchStore.getState().setResultView('list');
assert.equal(useVaultSearchStore.getState().resultDensity, 'detailed', 'returning to List defaults to Detailed');

useVaultSearchStore.getState().setResultDensity('compact');
useVaultSearchStore.getState().setResultView('list');
assert.equal(useVaultSearchStore.getState().resultDensity, 'compact', 'reselecting the active view does not erase a manual override');

useVaultSearchStore.getState().setResultView('tree');
assert.equal(useVaultSearchStore.getState().resultDensity, 'compact', 'switching views reapplies the target view default');

useVaultSearchStore.getState().reset();
assert.equal(useVaultSearchStore.getState().resultView, 'list');
assert.equal(useVaultSearchStore.getState().resultDensity, 'detailed', 'session reset restores the List/Detailed pair');

console.log('quick-search-result-view-density: passed');
