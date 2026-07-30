import React, { useEffect, useState } from 'react';
import { Brain, Network } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import type { AIAnalysisHistoryRecord } from '@/service/AIAnalysisHistoryService';
import { humanReadableTime } from '@/core/utils/date-utils';
import { useQuickSearchHost } from '../hooks/useQuickSearchHost';
import { Button } from '@/ui/component/shared-ui/button';

// ---------------------------------------------------------------------------
// AnalysisRow
// ---------------------------------------------------------------------------

const AnalysisRow: React.FC<{
	record: AIAnalysisHistoryRecord;
	onSelect: (record: AIAnalysisHistoryRecord) => void;
}> = ({ record, onSelect }) => {
	const isGraph = record.analysis_preset === 'aiGraph';
	const Icon = isGraph ? Network : Brain;
	const title = record.title ?? record.query ?? 'Untitled analysis';

	return (
		<Button
			variant="unstyled"
			onClick={() => onSelect(record)}
			className={cn(
				'!pktw-h-auto !pktw-min-h-12 !pktw-max-h-none pktw-w-full pktw-justify-start pktw-gap-3 !pktw-px-1 !pktw-py-2.5 pktw-text-left',
				'pktw-border-b pktw-border-pk-border/50 last:pktw-border-b-0',
				'hover:pktw-bg-pk-accent-tint pktw-cursor-pointer pktw-transition-colors pktw-group',
			)}
		>
			<div className="pktw-w-7 pktw-h-7 pktw-rounded-md pktw-flex pktw-items-center pktw-justify-center pktw-shrink-0 pktw-bg-pk-accent-soft pktw-text-pk-accent">
				<Icon className="pktw-w-3.5 pktw-h-3.5" />
			</div>
			<div className="pktw-flex-1 pktw-min-w-0">
				<span className="pktw-text-sm pktw-font-medium pktw-text-pk-foreground pktw-truncate pktw-block group-hover:pktw-text-pk-accent pktw-transition-colors">
					{title}
				</span>
				<span className="pktw-text-pk-sm pktw-text-pk-foreground-muted">
					{record.sources_count != null ? `${record.sources_count} sources · ` : ''}
					{humanReadableTime(record.created_at_ts)}
				</span>
			</div>
		</Button>
	);
};

// ---------------------------------------------------------------------------
// RecentAnalysisList
// ---------------------------------------------------------------------------

export interface RecentAnalysisListProps {
	onSelectQuery: (query: string) => void;
	onSelectRecord?: (record: AIAnalysisHistoryRecord) => void;
	limit?: number;
	filterQuery?: string;
}

export const RecentAnalysisList: React.FC<RecentAnalysisListProps> = ({
	onSelectQuery,
	onSelectRecord,
	limit = 6,
	filterQuery,
}) => {
	const host = useQuickSearchHost();
	const [records, setRecords] = useState<AIAnalysisHistoryRecord[]>([]);
	const [totalCount, setTotalCount] = useState(0);
	const [loading, setLoading] = useState(false);
	const [visibleLimit, setVisibleLimit] = useState(limit);
	const normalizedFilter = filterQuery?.trim() ?? '';

	useEffect(() => {
		setVisibleLimit(limit);
	}, [limit, normalizedFilter]);

	useEffect(() => {
		let cancelled = false;
		const load = async () => {
			setLoading(true);
			try {
				const service = host.aiAnalysisHistory;
				const [rows, count] = await Promise.all([
					normalizedFilter
						? service.search(normalizedFilter, { limit: visibleLimit, offset: 0 })
						: service.list({ limit: visibleLimit, offset: 0 }),
					normalizedFilter
						? service.searchCount(normalizedFilter)
						: service.count(),
				]);
				if (cancelled) return;
				setRecords(rows.filter((record) => record.query || record.title));
				setTotalCount(count);
			} catch (error) {
				if (cancelled) return;
				console.warn('[RecentAnalysisList] load failed:', error);
				setRecords([]);
				setTotalCount(0);
			} finally {
				if (!cancelled) setLoading(false);
			}
		};
		void load();
		return () => {
			cancelled = true;
		};
	}, [host.aiAnalysisHistory, normalizedFilter, visibleLimit]);

	return (
		<div className="pktw-border-t pktw-border-pk-border/50 pktw-mt-3 pktw-px-4 pktw-pt-4">
			<div className="pktw-flex pktw-items-center pktw-justify-between pktw-pb-2">
				<span className="pktw-text-xs pktw-font-medium pktw-text-pk-foreground-muted">
					Analysis history
				</span>
				{totalCount > 0 && (
					<span className="pktw-text-xs pktw-text-pk-foreground-muted">
						{totalCount} saved
					</span>
				)}
			</div>
			<div className="pktw-flex pktw-flex-col">
				{records.map((r, idx) => (
					<div key={r.id ?? idx} style={{ contentVisibility: 'auto', containIntrinsicSize: '0 48px' }}>
						<AnalysisRow record={r} onSelect={(rec) => {
							if (onSelectRecord && rec.vault_rel_path) {
								onSelectRecord(rec);
							} else if (rec.query) {
								onSelectQuery(rec.query);
							}
						}} />
					</div>
				))}
			</div>
			{loading && (
				<div className="pktw-py-3 pktw-text-center pktw-text-xs pktw-text-pk-foreground-muted">
					Loading history...
				</div>
			)}
			{!loading && records.length === 0 && (
				<div className="pktw-py-4 pktw-text-sm pktw-text-pk-foreground-muted">
					{normalizedFilter ? 'No saved analyses match this query.' : 'No saved analyses yet.'}
				</div>
			)}
			{!loading && records.length < totalCount && (
				<Button
					variant="ghost"
					size="sm"
					geometry="toolbar"
					onClick={() => setVisibleLimit((current) => current + limit)}
					className="pktw-mt-2 pktw-mb-1 pktw-text-xs pktw-text-pk-accent"
				>
					Show more
				</Button>
			)}
		</div>
	);
};
