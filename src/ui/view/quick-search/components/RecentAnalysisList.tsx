import React, { useEffect, useState } from 'react';
import { Brain, Network } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import { Button } from '@/ui/component/shared-ui/button';
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
                'pktw-flex pktw-items-center pktw-gap-2.5 pktw-px-2.5 pktw-py-2',
                'pktw-rounded-md hover:pktw-bg-[#f5f3ff]',
                'pktw-cursor-pointer pktw-transition-colors pktw-group',
            )}
        >
            <Icon className="pktw-w-3.5 pktw-h-3.5 pktw-shrink-0 pktw-text-[#7c3aed]" />
            <div className="pktw-flex-1 pktw-min-w-0">
                <span className="pktw-text-sm pktw-text-[#1f2937] pktw-truncate pktw-block group-hover:pktw-text-[#7c3aed]">
                    {title}
                </span>
                <span className="pktw-text-[11px] pktw-text-[#9ca3af]">
                    {record.sources_count != null ? `${record.sources_count} sources · ` : ''}
                    {humanReadableTime(record.created_at_ts)}
                </span>
            </div>
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
    limit = 8,
}) => {
    const [records, setRecords] = useState<AIAnalysisHistoryRecord[]>([]);
    const [totalCount, setTotalCount] = useState(0);

    useEffect(() => {
        const svc = AppContext.getInstance().aiAnalysisHistoryService;
        Promise.all([svc.list({ limit, offset: 0 }), svc.count()])
            .then(([rows, count]) => {
                setRecords(rows);
                setTotalCount(count);
            })
            .catch((e) => {
                console.warn('[RecentAnalysisList] load failed:', e);
            });
    }, [limit]);

    if (records.length === 0) return null;

    return (
        <div>
            <span className="pktw-block pktw-text-[10px] pktw-font-medium pktw-uppercase pktw-tracking-widest pktw-text-[#9ca3af] pktw-mb-1">
                Recent
            </span>
            <div className="pktw-flex pktw-flex-col">
                {records.map((r) => (
                    <AnalysisRow key={r.id} record={r} onSelectQuery={onSelectQuery} />
                ))}
            </div>
            {totalCount > limit && (
                <Button
                    variant="link"
                    size="sm"
                    className="pktw-mt-1 pktw-h-auto pktw-p-0 pktw-text-xs pktw-text-[#7c3aed]"
                    onClick={() => {/* no-op — caller decides navigation */}}
                >
                    View all {totalCount} analyses →
                </Button>
            )}
        </div>
    );
};
