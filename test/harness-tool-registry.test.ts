import assert from 'assert';
import { z } from 'zod';
import { ToolRegistry } from '@/service/agents/harness/tool/registry';
import type { ToolDef } from '@/service/agents/harness/tool/types';

function makeTool(name: string, allowedTiers?: ToolDef['allowedTiers']): ToolDef {
    return {
        name,
        description: `tool ${name}`,
        inputSchema: z.object({}),
        allowedTiers,
        async execute() {
            return { ok: true as const, data: null };
        },
    };
}

async function run(): Promise<void> {
    const tests: Array<{ name: string; fn: () => void }> = [
        {
            name: 'register + get + all',
            fn: () => {
                const reg = new ToolRegistry();
                reg.register(makeTool('a'));
                reg.register(makeTool('b'));
                assert.strictEqual(reg.all().length, 2);
                assert.ok(reg.has('a'));
                assert.strictEqual(reg.get('a')?.name, 'a');
            },
        },
        {
            name: 'duplicate name throws',
            fn: () => {
                const reg = new ToolRegistry();
                reg.register(makeTool('a'));
                assert.throws(() => reg.register(makeTool('a')), /duplicate tool name/);
            },
        },
        {
            name: 'forTier filters by allowedTiers',
            fn: () => {
                const reg = new ToolRegistry();
                reg.register(makeTool('open-all'));
                reg.register(makeTool('online-only', ['online']));
                reg.register(makeTool('local-fast-only', ['local-fast']));

                const fast = reg.forTier('local-fast').map((t) => t.name).sort();
                assert.deepStrictEqual(fast, ['local-fast-only', 'open-all']);

                const online = reg.forTier('online').map((t) => t.name).sort();
                assert.deepStrictEqual(online, ['online-only', 'open-all']);
            },
        },
        {
            name: 'forTier honors name whitelist',
            fn: () => {
                const reg = new ToolRegistry();
                reg.register(makeTool('a'));
                reg.register(makeTool('b'));
                reg.register(makeTool('c'));
                const out = reg.forTier('local-fast', ['a', 'c']).map((t) => t.name).sort();
                assert.deepStrictEqual(out, ['a', 'c']);
            },
        },
        {
            name: 'whitelist + tier filter combine',
            fn: () => {
                const reg = new ToolRegistry();
                reg.register(makeTool('a'));
                reg.register(makeTool('b', ['online']));
                const out = reg.forTier('local-fast', ['a', 'b']).map((t) => t.name);
                assert.deepStrictEqual(out, ['a']);
            },
        },
        {
            name: 'clear empties the registry',
            fn: () => {
                const reg = new ToolRegistry();
                reg.register(makeTool('a'));
                reg.clear();
                assert.strictEqual(reg.all().length, 0);
            },
        },
    ];

    let passed = 0;
    let failed = 0;
    for (const t of tests) {
        try {
            await t.fn();
            console.log(`  ✓ ${t.name}`);
            passed += 1;
        } catch (err) {
            console.error(`  ✗ ${t.name}`);
            console.error(`    ${(err as Error).message}`);
            failed += 1;
        }
    }
    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
}

void run();
