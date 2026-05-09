import { porterStem, stemText } from '@/service/search/support/porter-stemmer';

function runTests() {
    let passed = 0;
    let failed = 0;

    function assert(description: string, actual: string, expected: string) {
        if (actual === expected) {
            console.log(`  PASS: ${description}`);
            passed++;
        } else {
            console.error(`  FAIL: ${description}`);
            console.error(`    Expected: "${expected}"`);
            console.error(`    Got:      "${actual}"`);
            failed++;
        }
    }

    console.log('\nTesting porterStem - plurals and common forms...');
    assert('running→run',     porterStem('running'),     'run');
    assert('studies→studi',   porterStem('studies'),     'studi');
    assert('caresses→caress', porterStem('caresses'),    'caress');
    assert('ponies→poni',     porterStem('ponies'),       'poni');
    assert('ties→ti',         porterStem('ties'),         'ti');
    assert('cats→cat',        porterStem('cats'),         'cat');

    console.log('\nTesting porterStem - past tense / -ing forms...');
    assert('feed→feed',       porterStem('feed'),         'feed');
    assert('agreed→agre',     porterStem('agreed'),       'agre');
    assert('disabled→disabl', porterStem('disabled'),     'disabl');
    assert('matting→mat',     porterStem('matting'),      'mat');
    assert('mating→mate',     porterStem('mating'),       'mate');
    assert('meeting→meet',    porterStem('meeting'),      'meet');
    assert('milling→mill',    porterStem('milling'),      'mill');
    assert('messing→mess',    porterStem('messing'),      'mess');
    assert('meetings→meet',   porterStem('meetings'),     'meet');

    console.log('\nTesting porterStem - derivational suffixes...');
    assert('generalization→gener', porterStem('generalization'), 'gener');
    assert('oscillators→oscil',    porterStem('oscillators'),    'oscil');
    assert('conditional→condit',   porterStem('conditional'),    'condit');

    console.log('\nTesting porterStem - non-English pass-through...');
    assert('CJK 观察',   porterStem('观察'),   '观察');
    assert('JP データ',  porterStem('データ'), 'データ');
    assert('KR 한국어',  porterStem('한국어'), '한국어');
    assert('digits 42',  porterStem('42'),      '42');
    assert('empty string', porterStem(''),       '');

    console.log('\nTesting stemText - mixed input...');
    const mixed = stemText('running tests with 观察 and meetings');
    const containsRun  = mixed.includes('run');
    const containsTest = mixed.includes('test');
    const containsCJK  = mixed.includes('观察');
    const containsMeet = mixed.includes('meet');

    if (containsRun && containsTest && containsCJK && containsMeet) {
        console.log(`  PASS: stemText mixed input → "${mixed}"`);
        passed++;
    } else {
        console.error(`  FAIL: stemText mixed input → "${mixed}"`);
        console.error(`    Expected to contain: run=${containsRun}, test=${containsTest}, 观察=${containsCJK}, meet=${containsMeet}`);
        failed++;
    }

    console.log(`\n${failed === 0 ? 'All porter-stemmer tests passed' : `${failed} test(s) FAILED`} (${passed} passed, ${failed} failed)`);

    if (failed > 0) {
        process.exit(1);
    }
}

runTests();
