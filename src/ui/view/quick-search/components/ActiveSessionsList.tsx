import React, { useSyncExternalStore } from 'react';
import { Loader2, CheckCircle, Clock, AlertCircle, X } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import { Button } from '@/ui/component/shared-ui/button';
import {
    BackgroundSessionManager,
    type BackgroundSession,
    type BackgroundSessionStatus,
} from '@/service/BackgroundSessionManager';
import { formatDuration } from '@/core/utils/format-utils';

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

interface StatusConfig {
    Icon: React.ElementType;
    color: string;
    label: string;
    spin?: boolean;
}

const STATUS_CONFIG: Record<BackgroundSessionStatus, StatusConfig> = {
    streaming: { Icon: Loader2, color: '#7c3aed', label: 'Analyzing...', spin: true },
    'plan-ready': { Icon: CheckCircle, color: '#2563eb', label: 'Plan Ready' },
    queued: { Icon: Clock, color: '#6b7280', label: 'Queued' },
    completed: { Icon: CheckCircle, color: '#059669', label: 'Complete' },
    error: { Icon: AlertCircle, color: '#dc2626', label: 'Failed' },
};

// ---------------------------------------------------------------------------
// SessionCard
// ---------------------------------------------------------------------------

const SessionCard: React.FC<{
    session: BackgroundSession;
    onRestore: (id: string) => void;
    onCancel: (id: string) => void;
}> = ({ session, onRestore, onCancel }) => {
    const cfg = STATUS_CONFIG[session.status] ?? STATUS_CONFIG.streaming;
    const { Icon } = cfg;
    const elapsed = Date.now() - session.createdAt;
    const elapsedStr = formatDuration(elapsed);

    return (
        <div
            onClick={() => onRestore(session.id)}
            className={cn(
                'pktw-flex pktw-items-center pktw-gap-3 pktw-px-3 pktw-py-2.5',
                'pktw-rounded-lg pktw-border pktw-border-[#e5e7eb] pktw-bg-white',
                'hover:pktw-bg-[#f9fafb] pktw-cursor-pointer pktw-transition-colors pktw-group',
            )}
        >
            <Icon
                className={cn('pktw-w-3.5 pktw-h-3.5 pktw-shrink-0', cfg.spin && 'pktw-animate-spin')}
                style={{ color: cfg.color }}
            />
            <div className="pktw-flex-1 pktw-min-w-0">
                <span className="pktw-text-sm pktw-font-medium pktw-text-[#1f2937] pktw-truncate pktw-block">
                    {session.title ?? session.query.slice(0, 60)}
                </span>
                <span className="pktw-text-xs pktw-text-[#9ca3af]">
                    {elapsedStr} · {cfg.label}
                </span>
            </div>
            <Button
                size="xs"
                variant="ghost"
                onClick={(e) => { e.stopPropagation(); onCancel(session.id); }}
                className={cn(
                    'pktw-opacity-0 group-hover:pktw-opacity-100 pktw-transition-opacity',
                    'pktw-text-[#9ca3af] hover:pktw-text-[#ef4444]',
                    '!pktw-h-6 !pktw-w-6 pktw-p-0 pktw-shrink-0',
                )}
                title="Cancel"
            >
                <X className="pktw-w-3.5 pktw-h-3.5" />
            </Button>
        </div>
    );
};

// ---------------------------------------------------------------------------
// ActiveSessionsList
// ---------------------------------------------------------------------------

export interface ActiveSessionsListProps {
    onRestore: (sessionId: string) => void;
}

export const ActiveSessionsList: React.FC<ActiveSessionsListProps> = ({ onRestore }) => {
    const sessions = useSyncExternalStore(
        (cb) => BackgroundSessionManager.getInstance().subscribe(cb),
        () => BackgroundSessionManager.getInstance().getSessions(),
    );

    const active = sessions.filter((s) => s.status !== 'completed');

    if (active.length === 0) return null;

    const handleCancel = (id: string) => {
        BackgroundSessionManager.getInstance().cancelSession(id);
    };

    return (
        <div>
            <span className="pktw-block pktw-text-[10px] pktw-font-medium pktw-uppercase pktw-tracking-widest pktw-text-[#9ca3af] pktw-mb-2">
                Active
            </span>
            <div className="pktw-flex pktw-flex-col pktw-gap-1.5">
                {active.map((s) => (
                    <SessionCard
                        key={s.id}
                        session={s}
                        onRestore={onRestore}
                        onCancel={handleCancel}
                    />
                ))}
            </div>
        </div>
    );
};
