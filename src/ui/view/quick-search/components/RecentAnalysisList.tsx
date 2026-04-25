import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Brain, Network } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import { AppContext } from '@/app/context/AppContext';
import type { AIAnalysisHistoryRecord } from '@/service/AIAnalysisHistoryService';
import { humanReadableTime } from '@/core/utils/date-utils';

// ---------------------------------------------------------------------------
// AnalysisRow
// ---------------------------------------------------------------------------

const AnalysisRow: React.FC<{
	record: AIAnalysisHistoryRecord;
	onSelectQuery: (query: string) => void;
}> = ({ record, onSelectQuery }) => {
	const isGraph = record.analysis_preset === 'aiGraph';
	const Icon = isGraph ? Network : Brain;
	const title = record.title ?? record.query ?? 'Untitled analysis';

	return (
		<div
			onClick={() => record.query && onSelectQuery(record.query)}
			className={cn(
				'pktw-flex pktw-items-center pktw-gap-3 pktw-px-1 pktw-py-2.5',
				'pktw-border-b pktw-border-pk-border/50 last:pktw-border-b-0',
				'hover:pktw-bg-[#f5f3ff] pktw-cursor-pointer pktw-transition-colors pktw-group',
			)}
		>
			<div className="pktw-w-7 pktw-h-7 pktw-rounded-md pktw-flex pktw-items-center pktw-justify-center pktw-shrink-0 pktw-bg-[#ede9fe] pktw-text-pk-accent">
				<Icon className="pktw-w-3.5 pktw-h-3.5" />
			</div>
			<div className="pktw-flex-1 pktw-min-w-0">
				<span className="pktw-text-sm pktw-font-medium pktw-text-pk-foreground pktw-truncate pktw-block group-hover:pktw-text-pk-accent pktw-transition-colors">
					{title}
				</span>
				<span className="pktw-text-[11px] pktw-text-pk-foreground-muted">
					{record.sources_count != null ? `${record.sources_count} sources · ` : ''}
					{humanReadableTime(record.created_at_ts)}
				</span>
			</div>
			<span className="pktw-text-[11px] pktw-text-pk-foreground-muted pktw-shrink-0">
				{humanReadableTime(record.created_at_ts)}
			</span>
		</div>
	);
};

// ---------------------------------------------------------------------------
// RecentAnalysisList
// ---------------------------------------------------------------------------

export interface RecentAnalysisListProps {
	onSelectQuery: (query: string) => void;
	limit?: number;
}

export const RecentAnalysisList: React.FC<RecentAnalysisListProps> = ({
	onSelectQuery,
	limit = 15,
}) => {
	const [records, setRecords] = useState<AIAnalysisHistoryRecord[]>([]);
	const [totalCount, setTotalCount] = useState(0);
	const [loading, setLoading] = useState(false);
	const sentinelRef = useRef<HTMLDivElement>(null);
	const offsetRef = useRef(0);
	const doneRef = useRef(false);

	const loadMore = useCallback(async () => {
		if (loading || doneRef.current) return;
		setLoading(true);
		try {
			const svc = AppContext.getInstance().aiAnalysisHistoryService;
			const [rows, count] = await Promise.all([
				svc.list({ limit, offset: offsetRef.current }),
				offsetRef.current === 0 ? svc.count() : Promise.resolve(totalCount),
			]);
			if (offsetRef.current === 0) setTotalCount(count);
			if (rows.length < limit) doneRef.current = true;
			offsetRef.current += rows.length;
			setRecords((prev) => [...prev, ...rows]);
		} catch (e) {
			console.warn('[RecentAnalysisList] load failed:', e);
		} finally {
			setLoading(false);
		}
	}, [limit, totalCount, loading]);

	// Initial load
	useEffect(() => { void loadMore(); }, []);

	// IntersectionObserver for infinite scroll
	useEffect(() => {
		const el = sentinelRef.current;
		if (!el) return;
		const observer = new IntersectionObserver(
			(entries) => { if (entries[0]?.isIntersecting) void loadMore(); },
			{ rootMargin: '200px' },
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, [loadMore]);

	if (records.length === 0 && !loading) return null;

	return (
		<div className="pktw-border-t pktw-border-pk-border/50 pktw-mt-2">
			<span className="pktw-block pktw-text-[10px] pktw-font-medium pktw-uppercase pktw-tracking-widest pktw-text-pk-foreground-muted pktw-pt-4 pktw-pb-2">
				Recent
			</span>
			<div className="pktw-flex pktw-flex-col">
				{records.map((r) => (
					<AnalysisRow key={r.id ?? r.vault_rel_path} record={r} onSelectQuery={onSelectQuery} />
				))}
			</div>
			<div ref={sentinelRef}>
				{loading && (
					<div className="pktw-py-3 pktw-text-center pktw-text-xs pktw-text-pk-foreground-muted">
						Loading...
					</div>
				)}
			</div>
		</div>
	);
};
