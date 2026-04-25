import React, { useSyncExternalStore } from 'react';
import { Loader2, CheckCircle, Clock, AlertCircle, X } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
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
	const isPlanReady = session.status === 'plan-ready';

	return (
		<div
			onClick={() => onRestore(session.id)}
			className={cn(
				'pktw-flex pktw-items-center pktw-gap-3 pktw-px-3.5 pktw-py-2.5',
				'pktw-rounded-lg pktw-border pktw-cursor-pointer pktw-transition-all pktw-group',
				isPlanReady
					? 'pktw-border-[#93c5fd] pktw-bg-[#eff6ff] hover:pktw-border-[#60a5fa] hover:pktw-bg-[#dbeafe]'
					: 'pktw-border-pk-border pktw-bg-pk-background hover:pktw-border-[#7c3aed]/25 hover:pktw-bg-[#faf8ff]'
			)}
		>
			<div className={cn(
				'pktw-w-7 pktw-h-7 pktw-rounded-md pktw-flex pktw-items-center pktw-justify-center pktw-shrink-0',
				isPlanReady ? 'pktw-bg-[#dbeafe] pktw-text-[#2563eb]' :
				session.status === 'streaming' ? 'pktw-bg-[#ede9fe] pktw-text-pk-accent' :
				'pktw-bg-[#f3f4f6] pktw-text-pk-foreground-muted'
			)}>
				<Icon
					className={cn('pktw-w-3.5 pktw-h-3.5', cfg.spin && 'pktw-animate-spin')}
				/>
			</div>
			<div className="pktw-flex-1 pktw-min-w-0">
				<span className="pktw-text-sm pktw-font-medium pktw-text-pk-foreground pktw-truncate pktw-block">
					{session.title ?? session.query.slice(0, 60)}
				</span>
				<span className="pktw-text-xs pktw-text-pk-foreground-muted">
					<span className="pktw-font-semibold" style={{ color: cfg.color }}>{cfg.label}</span>
					{' · '}{elapsedStr}
				</span>
			</div>
			{session.status === 'streaming' && (
				<div className="pktw-w-14 pktw-shrink-0">
					<div className="pktw-h-1 pktw-bg-pk-border pktw-rounded-full pktw-overflow-hidden">
						<div className="pktw-h-full pktw-bg-pk-accent pktw-rounded-full pktw-animate-pulse" style={{ width: '65%' }} />
					</div>
				</div>
			)}
			{isPlanReady && (
				<span
					onClick={(e) => { e.stopPropagation(); onRestore(session.id); }}
					className="pktw-text-[11px] pktw-font-semibold pktw-text-[#2563eb] pktw-bg-[#dbeafe] pktw-border pktw-border-[#93c5fd] pktw-px-2.5 pktw-py-1 pktw-rounded-md pktw-shrink-0 pktw-cursor-pointer hover:pktw-bg-[#bfdbfe] pktw-transition-colors"
				>
					Review Plan →
				</span>
			)}
			<div
				onClick={(e) => { e.stopPropagation(); onCancel(session.id); }}
				className={cn(
					'pktw-w-6 pktw-h-6 pktw-rounded-md pktw-flex pktw-items-center pktw-justify-center pktw-shrink-0',
					'pktw-opacity-0 group-hover:pktw-opacity-100 pktw-transition-all',
					'pktw-text-pk-foreground-muted hover:pktw-bg-[#fee2e2] hover:pktw-text-[#dc2626] pktw-cursor-pointer',
				)}
				title="Cancel"
			>
				<X className="pktw-w-3.5 pktw-h-3.5" />
			</div>
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
        <div className="pktw-px-4 pktw-mt-3">
            <span className="pktw-block pktw-text-[10px] pktw-font-medium pktw-uppercase pktw-tracking-widest pktw-text-pk-foreground-muted pktw-mb-2">
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
