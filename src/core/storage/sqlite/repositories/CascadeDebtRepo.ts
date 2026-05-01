import type { Kysely } from 'kysely';
import type { Database as DbSchema } from '../ddl';
import type { CascadeDebtRecord, CascadeDebtType } from '@/service/search/index/cascade/types';

/**
 * Repository for cascade debt records: side-effect work enqueued after document index changes.
 *
 * Dedup semantics: at most one unprocessed row per (tenant, target_id, debt_type).
 * On conflict, only updates priority and change_magnitude if the new priority is higher (lower number).
 */
export class CascadeDebtRepo {
    constructor(private readonly db: Kysely<DbSchema>) {}

    /**
     * Insert a new debt record, or update the existing unprocessed one if the new priority is higher.
     */
    async insertOrUpdatePriority(record: Omit<CascadeDebtRecord, 'id' | 'processedAt'>): Promise<void> {
        const existing = await this.db
            .selectFrom('cascade_debt')
            .select(['id', 'priority'])
            .where('tenant', '=', record.tenant)
            .where('target_id', '=', record.targetId)
            .where('debt_type', '=', record.debtType)
            .where('processed_at', 'is', null)
            .executeTakeFirst();

        if (existing) {
            if (record.priority < existing.priority) {
                await this.db
                    .updateTable('cascade_debt')
                    .set({
                        priority: record.priority,
                        change_magnitude: record.changeMagnitude ?? null,
                        source_path: record.sourcePath,
                    })
                    .where('id', '=', existing.id!)
                    .execute();
            }
            return;
        }

        await this.db
            .insertInto('cascade_debt')
            .values({
                tenant: record.tenant,
                source_path: record.sourcePath,
                target_id: record.targetId,
                debt_type: record.debtType,
                priority: record.priority,
                change_magnitude: record.changeMagnitude ?? null,
                created_at: record.createdAt,
                processed_at: null,
            })
            .execute();
    }

    /**
     * Fetch the next batch of unprocessed debt items, ordered by priority then age (oldest first).
     */
    async drainPending(tenant: string, limit: number): Promise<CascadeDebtRecord[]> {
        const rows = await this.db
            .selectFrom('cascade_debt')
            .selectAll()
            .where('tenant', '=', tenant)
            .where('processed_at', 'is', null)
            .orderBy('priority', 'asc')
            .orderBy('created_at', 'asc')
            .limit(limit)
            .execute();

        return rows.map((r) => ({
            id: r.id,
            tenant: r.tenant,
            sourcePath: r.source_path,
            targetId: r.target_id,
            debtType: r.debt_type as CascadeDebtType,
            priority: r.priority,
            changeMagnitude: r.change_magnitude,
            createdAt: r.created_at,
            processedAt: r.processed_at,
        }));
    }

    /**
     * Mark debt items as processed by their IDs.
     */
    async markProcessed(ids: number[]): Promise<void> {
        if (ids.length === 0) return;
        const now = Date.now();
        await this.db
            .updateTable('cascade_debt')
            .set({ processed_at: now })
            .where('id', 'in', ids)
            .execute();
    }

    /**
     * Count unprocessed debt items for the given tenant.
     */
    async pendingCount(tenant: string): Promise<number> {
        const result = await this.db
            .selectFrom('cascade_debt')
            .select((eb) => eb.fn.countAll<number>().as('cnt'))
            .where('tenant', '=', tenant)
            .where('processed_at', 'is', null)
            .executeTakeFirstOrThrow();
        return result.cnt;
    }

    /**
     * Delete processed debt records older than the given age (default: 24 hours).
     */
    async clearProcessed(olderThanMs: number = 24 * 60 * 60 * 1000): Promise<void> {
        const cutoff = Date.now() - olderThanMs;
        await this.db
            .deleteFrom('cascade_debt')
            .where('processed_at', 'is not', null)
            .where('processed_at', '<', cutoff)
            .execute();
    }
}
