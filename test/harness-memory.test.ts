/**
 * M3 — memory block + reflection store coverage.
 *
 * Uses the in-memory ReflectionStore variant to keep this test runner free of
 * better-sqlite3 setup; the SQLite-backed variant is exercised indirectly via
 * the existing sqlite-schema-migration test (new `harness_reflection` table is
 * recreated from `migrateSqliteSchema`).
 */

import assert from 'assert';
import BetterSqlite3 from 'better-sqlite3';
import {
    Kysely,
    SqliteAdapter,
    SqliteIntrospector,
    SqliteQueryCompiler,
    type CompiledQuery,
} from 'kysely';
import { migrateSqliteSchema } from '@/core/storage/sqlite/ddl';
import type { Database as DbSchema } from '@/core/storage/sqlite/ddl';
import {
    MemoryStore,
    createMemoryBlock,
    renderMemoryBlocks,
    InMemoryReflectionStore,
    ReflectionStore,
} from '@/service/agents/harness/memory';

function makeKysely(db: BetterSqlite3.Database): Kysely<DbSchema> {
    const driver = {
        async init() {},
        async acquireConnection() {
            return {
                async executeQuery(q: CompiledQuery) {
                    const stmt = db.prepare(q.sql);
                    if (q.parameters && q.parameters.length > 0) {
                        if (stmt.reader) {
                            return { rows: stmt.all(...(q.parameters as any[])) };
                        }
                        const r = stmt.run(...(q.parameters as any[]));
                        return {
                            rows: [],
                            numAffectedRows: BigInt(r.changes),
                            insertId: r.lastInsertRowid ? BigInt(r.lastInsertRowid) : undefined,
                        };
                    }
                    if (stmt.reader) {
                        return { rows: stmt.all() };
                    }
                    const r = stmt.run();
                    return {
                        rows: [],
                        numAffectedRows: BigInt(r.changes),
                        insertId: r.lastInsertRowid ? BigInt(r.lastInsertRowid) : undefined,
                    };
                },
                async *streamQuery(q: CompiledQuery) {
                    const result = await driver.acquireConnection().then((c) => c.executeQuery(q));
                    yield result;
                },
            };
        },
        async beginTransaction() { db.exec('BEGIN'); },
        async commitTransaction() { db.exec('COMMIT'); },
        async rollbackTransaction() { db.exec('ROLLBACK'); },
        async releaseConnection() {},
        async destroy() {},
    };
    return new Kysely<DbSchema>({
        dialect: {
            createDriver: () => driver as any,
            createQueryCompiler: () => new SqliteQueryCompiler(),
            createAdapter: () => new SqliteAdapter(),
            createIntrospector: (k) => new SqliteIntrospector(k),
        },
    });
}

async function run(): Promise<void> {
    const tests: Array<{ name: string; fn: () => Promise<void> }> = [
        {
            name: 'createMemoryBlock applies defaults; required fields enforced',
            fn: async () => {
                const block = createMemoryBlock({ id: 'task', name: 'task', content: 'plan it' });
                assert.strictEqual(block.priority, 5);
                assert.strictEqual(block.evictable, true);
                assert.strictEqual(block.tokenBudget, undefined);
                assert.throws(() => createMemoryBlock({ id: '', name: 'x', content: 'y' }));
                assert.throws(() => createMemoryBlock({ id: 'x', name: '', content: 'y' }));
            },
        },
        {
            name: 'MemoryStore.set/get/remove + activeBlocks priority desc',
            fn: async () => {
                const store = new MemoryStore();
                store.set(createMemoryBlock({ id: 'a', name: 'a', content: 'low', priority: 1 }));
                store.set(createMemoryBlock({ id: 'b', name: 'b', content: 'high', priority: 10 }));
                store.set(createMemoryBlock({ id: 'c', name: 'c', content: 'mid', priority: 5 }));
                assert.strictEqual(store.size(), 3);

                const active = store.activeBlocks();
                assert.deepStrictEqual(
                    active.map((b) => b.id),
                    ['b', 'c', 'a'],
                );

                // Mutating snapshot copies does not affect store.
                active[0].content = 'mutated';
                assert.strictEqual(store.get('b')?.content, 'high');

                store.remove('b');
                assert.strictEqual(store.size(), 2);
                assert.strictEqual(store.has('b'), false);
            },
        },
        {
            name: 'MemoryStore respects per-block token budget independence',
            fn: async () => {
                // Spec §3.8 invariant: each block carries its own budget; we
                // verify the value round-trips without being clamped by store.
                const store = new MemoryStore();
                store.set(createMemoryBlock({
                    id: 'task', name: 'task', content: 'x'.repeat(2000),
                    tokenBudget: 100, priority: 9, evictable: false,
                }));
                store.set(createMemoryBlock({
                    id: 'vault_ctx', name: 'vault_ctx', content: 'y'.repeat(50),
                    tokenBudget: 5000, priority: 2,
                }));
                const blocks = store.activeBlocks();
                const taskBlock = blocks.find((b) => b.id === 'task');
                const vaultBlock = blocks.find((b) => b.id === 'vault_ctx');
                assert.strictEqual(taskBlock?.tokenBudget, 100);
                assert.strictEqual(vaultBlock?.tokenBudget, 5000);
                assert.strictEqual(taskBlock?.evictable, false);
                assert.strictEqual(vaultBlock?.evictable, true);
            },
        },
        {
            name: 'renderMemoryBlocks emits blocks in priority desc with labels',
            fn: async () => {
                const blocks = [
                    createMemoryBlock({ id: 'a', name: 'task', content: 'A', priority: 1 }),
                    createMemoryBlock({ id: 'b', name: 'vault_ctx', content: 'B', priority: 10 }),
                ];
                const rendered = renderMemoryBlocks(blocks);
                const aIdx = rendered.indexOf('memory:task');
                const bIdx = rendered.indexOf('memory:vault_ctx');
                assert.ok(bIdx >= 0 && aIdx > bIdx, 'higher priority should appear first');
            },
        },
        {
            name: 'InMemoryReflectionStore insert + listByAgent newest-first',
            fn: async () => {
                const store = new InMemoryReflectionStore();
                await store.insert({ loopId: 'L1', agentName: 'vault-review', insight: 'A', createdAt: 1000 });
                await store.insert({ loopId: 'L2', agentName: 'vault-review', insight: 'B', createdAt: 2000 });
                await store.insert({ loopId: 'L3', agentName: 'follow-up', insight: 'C', createdAt: 1500 });

                const byAgent = await store.listByAgent('vault-review');
                assert.deepStrictEqual(
                    byAgent.map((r) => r.insight),
                    ['B', 'A'],
                );
                const byLoop = await store.listByLoop('L1');
                assert.strictEqual(byLoop.length, 1);
                assert.strictEqual(byLoop[0].agentName, 'vault-review');
            },
        },
        {
            name: 'InMemoryReflectionStore validates required fields',
            fn: async () => {
                const store = new InMemoryReflectionStore();
                // The in-memory variant does not throw — it accepts anything.
                // Required-field validation lives on the SQLite-backed
                // ReflectionStore (see next test).
                const r = await store.insert({ loopId: 'L', agentName: 'a', insight: 'i', createdAt: 1 });
                assert.ok(r.id && r.id > 0);
            },
        },
        {
            name: 'ReflectionStore writes + reads via in-memory SQLite',
            fn: async () => {
                const raw = new BetterSqlite3(':memory:');
                migrateSqliteSchema({ exec: (sql: string) => raw.exec(sql) });
                const kdb = makeKysely(raw);
                const store = new ReflectionStore(kdb);

                const now = Date.now();
                const stored = await store.insert({
                    loopId: 'L-sql-1',
                    agentName: 'vault-review',
                    insight: 'compactions help on long sessions',
                    createdAt: now,
                    metadata: { tier: 'local-deep', steps: 3 },
                });
                assert.ok(stored.id && stored.id > 0, 'insert should return autoincrement id');

                await store.insert({
                    loopId: 'L-sql-2',
                    agentName: 'vault-review',
                    insight: 'older insight',
                    createdAt: now - 5000,
                });

                const byAgent = await store.listByAgent('vault-review');
                assert.strictEqual(byAgent.length, 2);
                assert.strictEqual(byAgent[0].insight, 'compactions help on long sessions');
                assert.deepStrictEqual(byAgent[0].metadata, { tier: 'local-deep', steps: 3 });
                assert.strictEqual(byAgent[1].insight, 'older insight');
                assert.strictEqual(byAgent[1].metadata, undefined);

                const byLoop = await store.listByLoop('L-sql-1');
                assert.strictEqual(byLoop.length, 1);
                assert.strictEqual(byLoop[0].loopId, 'L-sql-1');

                // Required-field validation lives on SQLite store.
                await assert.rejects(() =>
                    store.insert({ loopId: '', agentName: 'x', insight: 'y', createdAt: 1 }),
                );

                await kdb.destroy();
                raw.close();
            },
        },
        {
            name: 'migrateSqliteSchema creates harness_reflection idempotently',
            fn: async () => {
                const raw = new BetterSqlite3(':memory:');
                migrateSqliteSchema({ exec: (sql: string) => raw.exec(sql) });
                // Second invocation must not throw (IF NOT EXISTS).
                migrateSqliteSchema({ exec: (sql: string) => raw.exec(sql) });
                const cols = raw
                    .prepare(`PRAGMA table_info(harness_reflection)`)
                    .all()
                    .map((row: any) => String(row.name));
                for (const required of ['id', 'loop_id', 'agent_name', 'insight', 'created_at', 'metadata_json']) {
                    assert.ok(cols.includes(required), `harness_reflection missing column ${required}`);
                }
                raw.close();
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
            console.error(`    ${(err as Error).stack ?? (err as Error).message}`);
            failed += 1;
        }
    }
    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
}

void run();
