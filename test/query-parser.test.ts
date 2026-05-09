import { parseQuery, QueryPlan } from '@/service/search/query/query-parser';

function runTests() {
    let passed = 0;
    let failed = 0;

    function assert(description: string, actual: unknown, expected: unknown) {
        const actualStr = JSON.stringify(actual);
        const expectedStr = JSON.stringify(expected);
        if (actualStr === expectedStr) {
            console.log(`  PASS: ${description}`);
            passed++;
        } else {
            console.error(`  FAIL: ${description}`);
            console.error(`    Expected: ${expectedStr}`);
            console.error(`    Got:      ${actualStr}`);
            failed++;
        }
    }

    function assertTrue(description: string, condition: boolean) {
        if (condition) {
            console.log(`  PASS: ${description}`);
            passed++;
        } else {
            console.error(`  FAIL: ${description}`);
            failed++;
        }
    }

    // 1. Single term
    console.log('\nTest 1: Single term');
    {
        const plan: QueryPlan = parseQuery('obsidian');
        assert('1 term', plan.terms.length, 1);
        assert('text=obsidian', plan.terms[0].text, 'obsidian');
        assert('isPrefix=true', plan.terms[0].isPrefix, true);
        assert('no phrases', plan.phrases.length, 0);
        assert('no excludes', plan.excludes.length, 0);
    }

    // 2. Multiple terms
    console.log('\nTest 2: Multiple terms');
    {
        const plan: QueryPlan = parseQuery('obsidian plugin search');
        assert('3 terms', plan.terms.length, 3);
    }

    // 3. Phrase
    console.log('\nTest 3: Quoted phrase');
    {
        const plan: QueryPlan = parseQuery('"machine learning" tutorial');
        assert('1 phrase', plan.phrases.length, 1);
        assert('phrase=machine learning', plan.phrases[0], 'machine learning');
        assert('1 term', plan.terms.length, 1);
        assert('term=tutorial', plan.terms[0].text, 'tutorial');
    }

    // 4. Exclude
    console.log('\nTest 4: Exclude term');
    {
        const plan: QueryPlan = parseQuery('python -snake');
        assert('1 term', plan.terms.length, 1);
        assert('term=python', plan.terms[0].text, 'python');
        assert('1 exclude', plan.excludes.length, 1);
        assert('exclude=snake', plan.excludes[0], 'snake');
    }

    // 5. Tag filter
    console.log('\nTest 5: Tag filter');
    {
        const plan: QueryPlan = parseQuery('notes tag:project');
        assert('1 term', plan.terms.length, 1);
        assert('1 filter', plan.filters.length, 1);
        assert('filter field=tag', plan.filters[0].field, 'tag');
        assert('filter value=project', plan.filters[0].value, 'project');
    }

    // 6. Ext filter
    console.log('\nTest 6: Ext filter');
    {
        const plan: QueryPlan = parseQuery('report ext:pdf');
        assert('1 filter', plan.filters.length, 1);
        assert('filter field=ext', plan.filters[0].field, 'ext');
        assert('filter value=pdf', plan.filters[0].value, 'pdf');
    }

    // 7. Mixed
    console.log('\nTest 7: Mixed query');
    {
        const plan: QueryPlan = parseQuery('"deep learning" tutorial -beginner tag:ai');
        assert('1 phrase', plan.phrases.length, 1);
        assert('phrase=deep learning', plan.phrases[0], 'deep learning');
        assert('1 term', plan.terms.length, 1);
        assert('term=tutorial', plan.terms[0].text, 'tutorial');
        assert('1 exclude', plan.excludes.length, 1);
        assert('exclude=beginner', plan.excludes[0], 'beginner');
        assert('1 filter', plan.filters.length, 1);
        assert('filter tag=ai', plan.filters[0].value, 'ai');
    }

    // 8. Empty
    console.log('\nTest 8: Empty query');
    {
        const plan: QueryPlan = parseQuery('');
        assert('no terms', plan.terms.length, 0);
        assert('no phrases', plan.phrases.length, 0);
        assert('no excludes', plan.excludes.length, 0);
        assert('no filters', plan.filters.length, 0);
    }

    // 9. CJK stem = text
    console.log('\nTest 9: CJK stem equals text');
    {
        const plan: QueryPlan = parseQuery('机器学习');
        assertTrue('CJK term present', plan.terms.length >= 1);
        assertTrue('CJK stem equals text', plan.terms[0].stem === plan.terms[0].text);
    }

    // 10. English stem
    console.log('\nTest 10: English stem');
    {
        const plan: QueryPlan = parseQuery('running');
        assert('stem=run', plan.terms[0].stem, 'run');
    }

    // 11. Adaptive weights: single term → vector < 0.3
    console.log('\nTest 11: Adaptive weights single term');
    {
        const plan: QueryPlan = parseQuery('obsidian');
        assertTrue('single term vector < 0.3', plan.retrievers.vector < 0.3);
    }

    // 12. Adaptive weights: multi term → vector > 0.5
    console.log('\nTest 12: Adaptive weights multi term');
    {
        const plan: QueryPlan = parseQuery('obsidian plugin search');
        assertTrue('multi term vector > 0.5', plan.retrievers.vector > 0.5);
    }

    // 13. Adaptive weights: phrase → vector < 0.3
    console.log('\nTest 13: Adaptive weights phrase');
    {
        const plan: QueryPlan = parseQuery('"machine learning"');
        assertTrue('phrase vector < 0.3', plan.retrievers.vector < 0.3);
    }

    // 14. Adaptive weights: CJK → ftsStem < 0.1
    console.log('\nTest 14: Adaptive weights CJK');
    {
        const plan: QueryPlan = parseQuery('机器学习');
        assertTrue('CJK ftsStem < 0.1', plan.retrievers.ftsStem < 0.1);
    }

    console.log(`\n${failed === 0 ? 'All query-parser tests passed' : `${failed} test(s) FAILED`} (${passed} passed, ${failed} failed)`);

    if (failed > 0) {
        process.exit(1);
    }
}

runTests();
