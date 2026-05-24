/**
 * Procedural-memory persistence for the harness. See spec §3.8.
 *
 * Backed by the `harness_reflection` table in chat.sqlite (schema lives in
 * `src/core/storage/sqlite/ddl.ts`). M3 ships only the storage layer — the
 * offline batch job that *produces* reflections is M5+ work.
 *
 * For tests / non-SQLite consumers we also export `InMemoryReflectionStore`
 * implementing the same `ReflectionStoreLike` contract. The harness loop only
 * touches the interface, so callers can swap backends freely.
 */

import type { Kysely } from 'kysely';
import type { Database as DbSchema } from '@/core/storage/sqlite/ddl';
import type { Reflection, ReflectionStoreLike } from './types';

const DEFAULT_LIST_LIMIT = 50;

export class ReflectionStore implements ReflectionStoreLike {
    constructor(private readonly db: Kysely<DbSchema>) {}

    async insert(reflection: Reflection): Promise<Reflection> {
        if (!reflection.loopId) throw new Error('ReflectionStore.insert: loopId required');
        if (!reflection.agentName) throw new Error('ReflectionStore.insert: agentName required');
        if (!reflection.insight) throw new Error('ReflectionStore.insert: insight required');

        const row = await this.db
            .insertInto('harness_reflection')
            .values({
                id: undefined,
                loop_id: reflection.loopId,
                agent_name: reflection.agentName,
                insight: reflection.insight,
                created_at: reflection.createdAt,
                metadata_json: reflection.metadata ? JSON.stringify(reflection.metadata) : null,
            })
            .returning(['id'])
            .executeTakeFirst();
        return { ...reflection, id: Number(row?.id ?? 0) || undefined };
    }

    async listByAgent(agentName: string, limit: number = DEFAULT_LIST_LIMIT): Promise<Reflection[]> {
        const rows = await this.db
            .selectFrom('harness_reflection')
            .selectAll()
            .where('agent_name', '=', agentName)
            .orderBy('created_at', 'desc')
            .limit(limit)
            .execute();
        return rows.map(rowToReflection);
    }

    async listByLoop(loopId: string): Promise<Reflection[]> {
        const rows = await this.db
            .selectFrom('harness_reflection')
            .selectAll()
            .where('loop_id', '=', loopId)
            .orderBy('created_at', 'asc')
            .execute();
        return rows.map(rowToReflection);
    }
}

function rowToReflection(row: DbSchema['harness_reflection']): Reflection {
    let metadata: Record<string, unknown> | undefined;
    if (row.metadata_json) {
        try {
            metadata = JSON.parse(row.metadata_json) as Record<string, unknown>;
        } catch {
            metadata = undefined;
        }
    }
    return {
        id: row.id === undefined ? undefined : Number(row.id),
        loopId: row.loop_id,
        agentName: row.agent_name,
        insight: row.insight,
        createdAt: row.created_at,
        metadata,
    };
}

/**
 * In-memory variant for tests and ephemeral usage. Identical contract to
 * `ReflectionStore`. Insert order = retrieval order for `listByLoop`; latest
 * inserted first for `listByAgent`.
 */
export class InMemoryReflectionStore implements ReflectionStoreLike {
    private rows: Reflection[] = [];
    private nextId = 1;

    async insert(reflection: Reflection): Promise<Reflection> {
        const stored: Reflection = { ...reflection, id: this.nextId++ };
        this.rows.push(stored);
        return { ...stored };
    }

    async listByAgent(agentName: string, limit: number = DEFAULT_LIST_LIMIT): Promise<Reflection[]> {
        return this.rows
            .filter((r) => r.agentName === agentName)
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, limit)
            .map((r) => ({ ...r }));
    }

    async listByLoop(loopId: string): Promise<Reflection[]> {
        return this.rows
            .filter((r) => r.loopId === loopId)
            .sort((a, b) => a.createdAt - b.createdAt)
            .map((r) => ({ ...r }));
    }

    /** Test helper: drop everything. */
    clear(): void {
        this.rows = [];
        this.nextId = 1;
    }
}
