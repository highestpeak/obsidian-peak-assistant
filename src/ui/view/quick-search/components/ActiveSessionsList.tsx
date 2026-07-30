import React, { useSyncExternalStore } from 'react';
import { Loader2, CheckCircle, Clock, AlertCircle, X } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { Button } from '@/ui/component/shared-ui/button';
import type {
	QuickSearchBackgroundSessionStatus,
	QuickSearchBackgroundSessionSummary,
} from '@/service/search/background/QuickSearchBackgroundTypes';
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

const STATUS_CONFIG: Record<QuickSearchBackgroundSessionStatus, StatusConfig> = {
    streaming: { Icon: Loader2, color: 'var(--pk-accent)', label: 'Analyzing...', spin: true },
    'plan-ready': { Icon: CheckCircle, color: 'var(--pk-info-text)', label: 'Plan ready' },
    queued: { Icon: Clock, color: 'var(--pk-text-secondary)', label: 'Queued' },
    completed: { Icon: CheckCircle, color: 'var(--pk-success-text)', label: 'Complete' },
    error: { Icon: AlertCircle, color: 'var(--pk-error-text)', label: 'Failed' },
};

// ---------------------------------------------------------------------------
// SessionCard
// ---------------------------------------------------------------------------

const SessionCard: React.FC<{
	session: QuickSearchBackgroundSessionSummary;
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
			className={cn(
				'pktw-flex pktw-items-center pktw-gap-3 pktw-px-3.5 pktw-py-2.5',
				'pktw-rounded-lg pktw-border pktw-transition-all pktw-group',
				isPlanReady
					? 'pktw-border-pk-highlight-info-border pktw-bg-pk-highlight-info hover:pktw-border-pk-info hover:pktw-bg-pk-info-bg'
					: 'pktw-border-pk-border pktw-bg-pk-background hover:pktw-border-pk-accent/25 hover:pktw-bg-pk-accent-tint'
			)}
		>
			<Button
				variant="unstyled"
				size="sm"
				onClick={() => onRestore(session.id)}
				className="!pktw-h-auto !pktw-min-h-10 !pktw-max-h-none pktw-min-w-0 pktw-flex-1 pktw-justify-start pktw-gap-3 !pktw-p-0 pktw-text-left"
			>
				<div className={cn(
					'pktw-w-8 pktw-h-8 pktw-rounded-md pktw-flex pktw-items-center pktw-justify-center pktw-shrink-0',
					isPlanReady ? 'pktw-bg-pk-info-bg pktw-text-pk-info-text' :
					session.status === 'streaming' ? 'pktw-bg-pk-accent-soft pktw-text-pk-accent' :
					'pktw-bg-pk-surface-sunken pktw-text-pk-foreground-muted'
				)}>
					<Icon
						className={cn('pktw-w-4 pktw-h-4', cfg.spin && 'pktw-animate-spin')}
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
			</Button>
			{isPlanReady && (
				<Button
					variant="outline"
					size="sm"
					geometry="toolbar"
					onClick={() => onRestore(session.id)}
					className="pktw-text-sm pktw-font-semibold pktw-text-pk-info-text pktw-bg-pk-info-bg pktw-border-pk-highlight-info-border pktw-rounded-md pktw-shrink-0"
				>
					Review plan
				</Button>
			)}
			<Button
				variant="ghost"
				size="icon"
				geometry="toolbar-icon"
				onClick={() => onCancel(session.id)}
				className={cn(
					'pktw-rounded-md pktw-shrink-0',
					'pktw-opacity-0 group-hover:pktw-opacity-100 focus-visible:pktw-opacity-100 pktw-transition-all',
					'pktw-text-pk-foreground-muted hover:pktw-bg-pk-error-bg hover:pktw-text-pk-error-text',
				)}
				title="Cancel analysis"
			>
				<X className="pktw-w-4 pktw-h-4" />
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

const EMPTY_SESSIONS: QuickSearchBackgroundSessionSummary[] = [];

export const ActiveSessionsList: React.FC<ActiveSessionsListProps> = ({ onRestore }) => {
    const { quickSearchBackgroundRuntime } = useServiceContext();
    // Subscribe via the app-owned background runtime. The runtime may not
    // be bound yet during early modal mount (rare) — fall back to an empty
    // list rather than throwing.
    const sessions = useSyncExternalStore(
        (cb) => quickSearchBackgroundRuntime?.subscribe(cb) ?? (() => {}),
        () => quickSearchBackgroundRuntime?.getSessions() ?? EMPTY_SESSIONS,
    );

    const active = sessions.filter((s) => s.status !== 'completed');

    if (active.length === 0) return null;

    const handleCancel = (id: string) => {
        quickSearchBackgroundRuntime?.cancelSession(id);
    };

    return (
        <div className="pktw-px-4 pktw-mt-3">
            <span className="pktw-block pktw-text-xs pktw-font-medium pktw-text-pk-foreground-muted pktw-mb-2">
                Continue analysis
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
