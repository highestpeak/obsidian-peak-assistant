import { SearchClickRepo } from '../src/core/storage/sqlite/repositories/SearchClickRepo';

function assert(condition: boolean, msg: string) {
	if (!condition) { console.error('FAIL:', msg); process.exit(1); }
}

const stems = SearchClickRepo.buildQueryStems(['running', 'test']);
assert(stems === 'run test', `buildQueryStems: got "${stems}"`);

const stems2 = SearchClickRepo.buildQueryStems(['观察', 'data']);
assert(stems2 === 'data 观察', `buildQueryStems CJK: got "${stems2}"`);

const stems3 = SearchClickRepo.buildQueryStems([]);
assert(stems3 === '', `buildQueryStems empty: got "${stems3}"`);

// Order independence
const stems4 = SearchClickRepo.buildQueryStems(['beta', 'alpha']);
assert(stems4 === 'alpha beta', `buildQueryStems order: got "${stems4}"`);

console.log('All search-click-repo tests passed');
