import React from 'react';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';

export function StatusBar() {
    const registry = ProfileRegistry.getInstance();
    const agentProfile = registry.getActiveAgentProfile();
    const embeddingProfile = registry.getActiveEmbeddingProfile() ?? agentProfile;
    const sqliteReady = sqliteStoreManager.isInitialized();
    const hasEmbedding = !!(embeddingProfile?.embeddingEndpoint && embeddingProfile?.embeddingModel);

    return (
        <div className="pktw-flex pktw-gap-2.5 pktw-mb-5 pktw-flex-wrap">
            <Chip ok={!!agentProfile}
                  label={agentProfile ? `Agent: ${agentProfile.primaryModel}` : 'Agent: Not configured'} />
            <Chip ok={hasEmbedding}
                  label={hasEmbedding ? `Embedding: ${embeddingProfile!.embeddingModel}` : 'Embedding: Not configured'} />
            <Chip ok={sqliteReady}
                  label={sqliteReady ? 'SQLite: ready' : 'SQLite: unavailable'} />
        </div>
    );
}

function Chip({ ok, label }: { ok: boolean; label: string }) {
    return (
        <div className={`pktw-flex pktw-items-center pktw-gap-1.5 pktw-px-2.5 pktw-py-1 pktw-rounded-full pktw-text-xs ${
            ok ? 'pktw-bg-pk-success-muted pktw-text-pk-success' : 'pktw-bg-pk-error-muted pktw-text-pk-error'
        }`}>
            <div className={`pktw-w-1.5 pktw-h-1.5 pktw-rounded-full ${ok ? 'pktw-bg-pk-success' : 'pktw-bg-pk-error'}`} />
            {label}
        </div>
    );
}
