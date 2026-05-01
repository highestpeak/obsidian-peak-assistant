import { parseScenario, loadScenarioFile } from '@/core/telemetry/scenario-loader';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

function assert(cond: boolean, msg: string): void {
    if (!cond) {
        console.error(`FAIL: ${msg}`);
        process.exitCode = 1;
    } else {
        console.log(`PASS: ${msg}`);
    }
}

// Test 1: valid scenario parses
{
    const yaml = `agent: vault-search
fixture: small
query: "why is provider v2 worth it"
intent: |
  Verify the agent answers "reduce cognitive burden" from the hub note.
profile: claude-opus-4-6
`;
    const scenario = parseScenario(yaml);
    assert(scenario.agent === 'vault-search', 'agent parsed');
    assert(scenario.fixture === 'small', 'fixture parsed');
    assert(scenario.query.includes('provider v2'), 'query parsed');
    assert(scenario.intent.includes('cognitive burden'), 'intent parsed');
    assert(scenario.profile === 'claude-opus-4-6', 'profile parsed');
}

// Test 2: missing required field throws
{
    const yaml = `fixture: small\nquery: hi\nintent: test\n`;
    let threw = false;
    try {
        parseScenario(yaml);
    } catch (e) {
        threw = true;
        assert((e as Error).message.includes('agent'), 'error message names missing field');
    }
    assert(threw, 'missing agent field throws');
}

// Test 3: forbidden expect field throws
{
    const yaml = `agent: vault-search
fixture: small
query: hi
intent: test
expect:
  - tool: grep_file_tree
`;
    let threw = false;
    try {
        parseScenario(yaml);
    } catch (e) {
        threw = true;
        assert(
            (e as Error).message.includes('expect'),
            `error mentions forbidden "expect" field (got: ${(e as Error).message})`,
        );
    }
    assert(threw, 'forbidden expect field is rejected');
}

// Test 4: loadScenarioFile reads from disk
{
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scenario-test-'));
    const file = path.join(tmpDir, 'hub.yaml');
    fs.writeFileSync(
        file,
        `agent: vault-search\nfixture: small\nquery: q\nintent: i\n`,
        'utf8',
    );
    const scenario = loadScenarioFile(file);
    assert(scenario.agent === 'vault-search', 'loadScenarioFile parses from disk');
    assert(scenario.name === 'hub', 'scenario name derived from filename');
}
