import type { Kysely } from 'kysely';
import type { Database as DbSchema } from '../ddl';

export interface HubConstituentRecord {
    hubNodeId: string;
    memberDocId: string;
    role: 'core' | 'peripheral';
    addedAt: number;
}

export class HubConstituentRepo {
    constructor(private readonly db: Kysely<DbSchema>) {}

    /** Upsert members for a hub (replaces all existing members for that hub). */
    async replaceHubMembers(hubNodeId: string, members: Array<{ docId: string; role: 'core' | 'peripheral' }>): Promise<void> {
        await this.db.deleteFrom('hub_constituent').where('hub_node_id', '=', hubNodeId).execute();
        if (!members.length) return;
        const now = Date.now();
        await this.db.insertInto('hub_constituent').values(
            members.map((m) => ({
                hub_node_id: hubNodeId,
                member_doc_id: m.docId,
                role: m.role,
                added_at: now,
            }))
        ).execute();
    }

    /**
     * Returns hub node ids that contain the given doc as a constituent.
     * Used by cascade: "when doc A changes, which hubs are affected?"
     */
    async getHubsForMemberDoc(memberDocId: string): Promise<string[]> {
        const rows = await this.db
            .selectFrom('hub_constituent')
            .select('hub_node_id')
            .where('member_doc_id', '=', memberDocId)
            .execute();
        return rows.map((r) => r.hub_node_id);
    }

    /** Returns all members (doc ids + roles) for the given hub. */
    async getMembersForHub(hubNodeId: string): Promise<HubConstituentRecord[]> {
        const rows = await this.db
            .selectFrom('hub_constituent')
            .selectAll()
            .where('hub_node_id', '=', hubNodeId)
            .execute();
        return rows.map((r) => ({
            hubNodeId: r.hub_node_id,
            memberDocId: r.member_doc_id,
            role: r.role as 'core' | 'peripheral',
            addedAt: r.added_at,
        }));
    }

    /** Remove all constituent rows for a hub (when hub doc is deleted). */
    async deleteByHub(hubNodeId: string): Promise<void> {
        await this.db.deleteFrom('hub_constituent').where('hub_node_id', '=', hubNodeId).execute();
    }

    /** Remove all constituent rows where this doc is a member (when constituent doc is deleted). */
    async deleteByMember(memberDocId: string): Promise<void> {
        await this.db.deleteFrom('hub_constituent').where('member_doc_id', '=', memberDocId).execute();
    }

    /** Count members for a hub (used to decide incremental patch vs full regen). */
    async countMembersForHub(hubNodeId: string): Promise<number> {
        const r = await this.db
            .selectFrom('hub_constituent')
            .select((eb) => eb.fn.countAll<number>().as('cnt'))
            .where('hub_node_id', '=', hubNodeId)
            .executeTakeFirstOrThrow();
        return r.cnt;
    }
}
