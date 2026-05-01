export type CascadeDebtType =
    | 'semantic_edge'
    | 'degree_refresh'
    | 'mermaid_overlay'
    | 'hub_invalidate'
    | 'folder_stats';

export interface CascadeDebtRecord {
    id?: number;
    tenant: string;
    sourcePath: string;
    targetId: string;
    debtType: CascadeDebtType;
    priority: number;
    changeMagnitude: number | null;
    createdAt: number;
    processedAt: number | null;
}

export interface CascadeChangeInfo {
    docPath: string;
    docNodeId: string;
    contentHashChanged: boolean;
    embeddingChanged: boolean;
    outgoingLinksChanged: boolean;
    oldOutgoingTargetIds: string[];
    newOutgoingTargetIds: string[];
    changeMagnitude: number;
}

export interface PreIndexSnapshot {
    contentHash: string | null;
    outgoingTargetIds: string[];
    embeddingVector: number[] | null;
}
