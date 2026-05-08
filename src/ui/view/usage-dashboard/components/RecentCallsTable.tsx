import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/ui/component/shared-ui/button';
import { UsageTrackingService } from '@/service/usage/UsageTrackingService';
import type { UsageLogRow } from '@/core/storage/sqlite/ddl';
import type { TimeRange } from '@/service/usage/types';

interface RecentCallsTableProps {
	range: TimeRange;
}

const FEATURE_FILTERS = [
	{ label: 'All', value: undefined as string | undefined },
	{ label: 'Chat', value: 'chat' },
	{ label: 'Search', value: 'search_analysis' },
	{ label: 'Copilot', value: 'copilot' },
	{ label: 'Graph', value: 'graph' },
	{ label: 'Indexing', value: 'indexing' },
] as const;

const BADGE_COLORS: Record<string, string> = {
	chat: '#89b4fa',
	search_analysis: '#a6e3a1',
	copilot: '#f9e2af',
	graph: '#f38ba8',
	indexing: '#cba6f7',
	internal: '#94e2d5',
};

function formatTime(ms: number): string {
	const d = new Date(ms);
	return d.toLocaleString(undefined, {
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});
}

function formatTokens(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
	return n.toLocaleString();
}

function formatCost(n: number): string {
	if (n >= 0.01) return `$${n.toFixed(3)}`;
	return `$${n.toFixed(4)}`;
}

function formatDuration(ms: number): string {
	if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
	return `${Math.round(ms)}ms`;
}

export function RecentCallsTable({ range }: RecentCallsTableProps) {
	const [filter, setFilter] = useState<string | undefined>(undefined);
	const [calls, setCalls] = useState<UsageLogRow[]>([]);
	const [loading, setLoading] = useState(true);

	const fetchCalls = useCallback(async () => {
		setLoading(true);
		try {
			const svc = UsageTrackingService.getInstance();
			const result = await svc.getRecentCalls(range, filter, 50, 0);
			setCalls(result);
		} catch (err) {
			console.error('[RecentCallsTable] Failed to fetch:', err);
		} finally {
			setLoading(false);
		}
	}, [range, filter]);

	useEffect(() => {
		void fetchCalls();
	}, [fetchCalls]);

	const thStyle: React.CSSProperties = {
		color: 'var(--text-muted)',
		borderBottom: '1px solid var(--background-modifier-border)',
	};

	const tdStyle: React.CSSProperties = {
		color: 'var(--text-normal)',
		borderBottom: '1px solid var(--background-modifier-border)',
	};

	return (
		<div
			className="pktw-rounded-lg pktw-p-4"
			style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--background-modifier-border)' }}
		>
			{/* Header + Filter */}
			<div className="pktw-flex pktw-items-center pktw-justify-between pktw-mb-3">
				<span className="pktw-text-sm pktw-font-medium" style={{ color: 'var(--text-normal)' }}>
					Recent Calls
				</span>
				<div className="pktw-flex pktw-gap-1">
					{FEATURE_FILTERS.map((f) => (
						<Button
							key={f.label}
							variant={filter === f.value ? 'default' : 'ghost'}
							size="xs"
							onClick={() => setFilter(f.value)}
						>
							{f.label}
						</Button>
					))}
				</div>
			</div>

			{/* Table */}
			{loading ? (
				<div className="pktw-h-32 pktw-flex pktw-items-center pktw-justify-center">
					<span className="pktw-text-xs" style={{ color: 'var(--text-muted)' }}>Loading...</span>
				</div>
			) : calls.length === 0 ? (
				<div className="pktw-h-32 pktw-flex pktw-items-center pktw-justify-center">
					<span className="pktw-text-xs" style={{ color: 'var(--text-muted)' }}>No usage data yet</span>
				</div>
			) : (
				<div className="pktw-overflow-x-auto">
					<table className="pktw-w-full pktw-text-xs" style={{ borderCollapse: 'collapse' }}>
						<thead>
							<tr>
								<th className="pktw-text-left pktw-py-2 pktw-px-2 pktw-font-medium" style={thStyle}>Time</th>
								<th className="pktw-text-left pktw-py-2 pktw-px-2 pktw-font-medium" style={thStyle}>Feature</th>
								<th className="pktw-text-left pktw-py-2 pktw-px-2 pktw-font-medium" style={thStyle}>Action</th>
								<th className="pktw-text-left pktw-py-2 pktw-px-2 pktw-font-medium" style={thStyle}>Provider / Model</th>
								<th className="pktw-text-right pktw-py-2 pktw-px-2 pktw-font-medium" style={thStyle}>Input</th>
								<th className="pktw-text-right pktw-py-2 pktw-px-2 pktw-font-medium" style={thStyle}>Output</th>
								<th className="pktw-text-right pktw-py-2 pktw-px-2 pktw-font-medium" style={thStyle}>Cost</th>
								<th className="pktw-text-right pktw-py-2 pktw-px-2 pktw-font-medium" style={thStyle}>Latency</th>
							</tr>
						</thead>
						<tbody>
							{calls.map((row) => {
								const badgeColor = BADGE_COLORS[row.feature] ?? '#94e2d5';
								return (
									<tr key={row.id}>
										<td className="pktw-py-1.5 pktw-px-2 pktw-whitespace-nowrap" style={tdStyle}>
											{formatTime(row.created_at)}
										</td>
										<td className="pktw-py-1.5 pktw-px-2" style={tdStyle}>
											<span
												className="pktw-inline-block pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-text-[10px] pktw-font-medium"
												style={{
													backgroundColor: `${badgeColor}20`,
													color: badgeColor,
												}}
											>
												{row.feature}
											</span>
										</td>
										<td className="pktw-py-1.5 pktw-px-2 pktw-truncate pktw-max-w-[140px]" style={tdStyle}>
											{row.action}
										</td>
										<td className="pktw-py-1.5 pktw-px-2 pktw-truncate pktw-max-w-[160px]" style={tdStyle}>
											{row.provider} / {row.model}
										</td>
										<td className="pktw-py-1.5 pktw-px-2 pktw-text-right pktw-tabular-nums" style={tdStyle}>
											{formatTokens(row.input_tokens)}
										</td>
										<td className="pktw-py-1.5 pktw-px-2 pktw-text-right pktw-tabular-nums" style={tdStyle}>
											{formatTokens(row.output_tokens)}
										</td>
										<td className="pktw-py-1.5 pktw-px-2 pktw-text-right pktw-tabular-nums" style={tdStyle}>
											{formatCost(row.cost_usd)}
										</td>
										<td className="pktw-py-1.5 pktw-px-2 pktw-text-right pktw-tabular-nums" style={tdStyle}>
											{formatDuration(row.duration_ms)}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}
