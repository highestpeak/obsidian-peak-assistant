import { truncateToolOutput, DEFAULT_TOOL_CAP_BYTES } from '@/core/telemetry/truncate-tool-output';

function assert(cond: boolean, msg: string): void {
    if (!cond) {
        console.error(`FAIL: ${msg}`);
        process.exitCode = 1;
    } else {
        console.log(`PASS: ${msg}`);
    }
}

// Test 1: short output is untouched
{
    const input = 'abcdef';
    const result = truncateToolOutput(input, 1024);
    assert(result.output === 'abcdef', 'short output passes through unchanged');
    assert(result.truncated === false, 'short output is not marked truncated');
    assert(result.originalBytes === undefined, 'short output has no originalBytes');
}

// Test 2: output exactly at cap is untouched
{
    const input = 'a'.repeat(100);
    const result = truncateToolOutput(input, 100);
    assert(result.output.length === 100, 'output exactly at cap is not truncated');
    assert(result.truncated === false, 'at-cap output is not marked truncated');
}

// Test 3: output above cap is head+marker+tail
{
    const input = 'h'.repeat(500) + 'm'.repeat(100) + 't'.repeat(500); // 1100 bytes
    const cap = 1000; // head = 400, tail = 400, marker consumes the middle budget
    const result = truncateToolOutput(input, cap);
    assert(result.truncated === true, 'over-cap output is marked truncated');
    assert(result.originalBytes === 1100, 'originalBytes preserved');
    assert(result.output.startsWith('hhhh'), 'head preserved');
    assert(result.output.endsWith('tttt'), 'tail preserved');
    assert(result.output.includes('[...truncated'), 'truncation marker present');
    assert(result.output.length < input.length, 'truncated output is shorter');
    assert(result.output.length <= cap + 80, 'truncated output stays near cap (marker overhead ~80 bytes)');
}

// Test 4: default cap
{
    assert(DEFAULT_TOOL_CAP_BYTES === 10240, 'default cap is 10240 bytes');
}

// Test 5: cap of 0 disables truncation (pass through)
{
    const input = 'x'.repeat(50000);
    const result = truncateToolOutput(input, 0);
    assert(result.output.length === 50000, 'cap=0 disables truncation');
    assert(result.truncated === false, 'cap=0 output not marked truncated');
}

// Test 6: unicode safety — string length is used, not byte length (approximation)
{
    const input = '你'.repeat(500); // ~500 code points
    const result = truncateToolOutput(input, 100);
    assert(result.truncated === true, 'unicode over cap is truncated');
    assert(result.output.startsWith('你'), 'first unicode char preserved');
    assert(result.output.endsWith('你'), 'last unicode char preserved');
}
