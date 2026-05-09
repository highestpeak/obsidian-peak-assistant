import { levenshtein, findFuzzyCandidates } from '@/service/search/support/levenshtein';

function runTests() {
    let passed = 0;
    let failed = 0;

    function assert(condition: boolean, description: string, extra?: string) {
        if (condition) {
            console.log(`PASS: ${description}`);
            passed++;
        } else {
            console.error(`FAIL: ${description}${extra ? ' — ' + extra : ''}`);
            failed++;
        }
    }

    // --- levenshtein distance tests ---

    assert(levenshtein('', '') === 0, "levenshtein('', '') === 0");
    assert(levenshtein('abc', '') === 3, "levenshtein('abc', '') === 3");
    assert(levenshtein('', 'abc') === 3, "levenshtein('', 'abc') === 3");
    assert(levenshtein('kitten', 'sitting') === 3, "levenshtein('kitten', 'sitting') === 3");
    assert(levenshtein('machine', 'machien') === 2, "levenshtein('machine', 'machien') === 2");
    assert(levenshtein('obsidian', 'obsidian') === 0, "levenshtein('obsidian', 'obsidian') === 0");
    assert(levenshtein('test', 'tset') === 2, "levenshtein('test', 'tset') === 2");
    assert(levenshtein('abc', 'abc') === 0, "levenshtein('abc', 'abc') === 0");

    // --- findFuzzyCandidates tests ---

    const vocab = ['machine', 'learning', 'obsidian', 'plugin', 'search', 'matching'];

    const machienResults = findFuzzyCandidates('machien', vocab, 2);
    assert(
        machienResults.includes('machine'),
        "findFuzzyCandidates('machien', vocab, 2) includes 'machine'",
        `got: [${machienResults.join(', ')}]`
    );
    assert(
        !machienResults.includes('learning'),
        "findFuzzyCandidates('machien', vocab, 2) does NOT include 'learning'",
        `got: [${machienResults.join(', ')}]`
    );

    const serchResults = findFuzzyCandidates('serch', vocab, 2);
    assert(
        serchResults.includes('search'),
        "findFuzzyCandidates('serch', vocab, 2) includes 'search'",
        `got: [${serchResults.join(', ')}]`
    );

    const exactResults = findFuzzyCandidates('machine', vocab, 2);
    assert(
        !exactResults.includes('machine'),
        "findFuzzyCandidates('machine', vocab, 2) excludes exact match 'machine'",
        `got: [${exactResults.join(', ')}]`
    );
    assert(
        exactResults.length === 0 || !exactResults.includes('machine'),
        "findFuzzyCandidates('machine', vocab, 2) returns empty (exact match excluded)",
        `got: [${exactResults.join(', ')}]`
    );

    // verify results are sorted by distance then alphabetically
    const sortedResults = findFuzzyCandidates('machien', vocab, 3);
    let isSorted = true;
    for (let i = 1; i < sortedResults.length; i++) {
        const dPrev = levenshtein('machien', sortedResults[i - 1]);
        const dCurr = levenshtein('machien', sortedResults[i]);
        if (dPrev > dCurr) { isSorted = false; break; }
        if (dPrev === dCurr && sortedResults[i - 1] > sortedResults[i]) { isSorted = false; break; }
    }
    assert(isSorted, "findFuzzyCandidates results sorted by distance then alphabetically");

    if (failed > 0) {
        console.error(`\n${failed} test(s) failed.`);
        process.exit(1);
    }
    console.log(`\nAll levenshtein tests passed (${passed}/${passed + failed})`);
}

runTests();
