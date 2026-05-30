import React, { useEffect, useMemo, useState } from 'react';
import type { TimeRange } from '@/service/usage/types';
import type { UsageLogRow } from '@/core/storage/sqlite/ddl';
import { UsageTrackingService } from '@/service/usage/UsageTrackingService';
import { NumberedPager, BrandAvatar } from '../components/charts';
import { WhatWasThisAbout } from '../components/WhatWasThisAbout';
import type { DetailPanelStrings } from '../UsageDashboard';
import type { ProviderId } from '@/ui/components/primitives/types';

export interface HistoryScreenProps {
	range: TimeRange;
	detailStrings: DetailPanelStrings;
}

const PAGE_SIZE = 25;

/**
 * 05 · Usage History (spec §6.1 G · JTBD 6 debug spend).
 *
 * PR-Dash-3: paged call table + "What was this about" Modal that switches per
 * feature (spec §11.5). The Modal renders BEFORE the token/cost data on
 * purpose — the audit story is "what was I doing" first, "what did it cost"
 * second.
 */
export function HistoryScreen({ range, detailStrings }: HistoryScreenProps) {
	const [page, setPage] = useState(1);
	const [rows, setRows] = useState<UsageLogRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [activeRow, setActiveRow] = useState<UsageLogRow | null>(null);

	// Reset to page 1 whenever the time range changes — keeping page N when
	// the underlying row set shrinks would land on an empty page.
	useEffect(() => {
		setPage(1);
	}, [range]);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		(async () => {
			try {
				const svc = UsageTrackingService.getInstance();
				// Fetch one page worth + a probe row to know if "next" exists.
				const fetched = await svc.getRecentCalls(
					range,
					undefined,
					PAGE_SIZE + 1,
					(page - 1) * PAGE_SIZE,
				);
				if (cancelled) return;
				setRows(fetched);
				setLoading(false);
			} catch (e) {
				console.error('[HistoryScreen] Failed to load calls', e);
				if (!cancelled) {
					setRows([]);
					setLoading(false);
				}
			}
		})();
		return () => { cancelled = true; };
	}, [range, page]);

	const visible = useMemo(() => rows.slice(0, PAGE_SIZE), [rows]);
	const hasNext = rows.length > PAGE_SIZE;
	// Without a COUNT query we don't know totalPages; use page+1 when we
	// know more exist, otherwise pin at current page. Keeps UI honest.
	const pageCount = hasNext ? page + 1 : page;

	return (
		<div className="pk-dash-screen">
			<section className="pk-dash-section">
				<div className="pk-dash-section__head">
					<span className="pk-dash-section__title">Calls</span>
					<span className="pk-dash-section__sub">Click a row to inspect</span>
				</div>
				{loading ? (
					<div className="pk-dash-empty">Loading…</div>
				) : visible.length === 0 ? (
					<div className="pk-dash-empty">No calls in this range.</div>
				) : (
					<>
						<table className="pk-dash-table">
							<thead>
								<tr>
									<th>When</th>
									<th>Feature</th>
									<th>Provider · model</th>
									<th className="pk-dash-table__num">Tokens</th>
									<th className="pk-dash-table__num">Cost</th>
								</tr>
							</thead>
							<tbody>
								{visible.map((row) => (
									<tr key={row.id} onClick={() => setActiveRow(row)}>
										<td>{formatTime(row.created_at)}</td>
										<td>{row.feature}</td>
										<td>
											<span className="pk-dash-table__provider">
												<BrandAvatar
													provider={normalizeProvider(row.provider)}
													size="sm"
												/>
												<span>{row.model}</span>
											</span>
										</td>
										<td className="pk-dash-table__num">
											{(row.input_tokens + row.output_tokens).toLocaleString()}
										</td>
										<td className="pk-dash-table__num">
											${row.cost_usd.toFixed(4)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
						<div className="pk-dash-pager-row">
							<span className="pk-dash-pager-row__count">
								{visible.length} call{visible.length === 1 ? '' : 's'} · page {page}
							</span>
							<NumberedPager
								page={page}
								pageCount={pageCount}
								onChange={setPage}
								aria-label="Calls pagination"
							/>
						</div>
					</>
				)}
			</section>

			<WhatWasThisAbout
				open={activeRow !== null}
				onClose={() => setActiveRow(null)}
				row={activeRow}
				strings={detailStrings}
			/>
		</div>
	);
}

function formatTime(ms: number): string {
	const d = new Date(ms);
	const today = new Date();
	const sameDay = d.toDateString() === today.toDateString();
	if (sameDay) {
		return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
	}
	return d.toLocaleString(undefined, {
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});
}

function normalizeProvider(p: string): ProviderId | undefined {
	const normalized = p?.toLowerCase().trim();
	if (
		normalized === 'openai' ||
		normalized === 'anthropic' ||
		normalized === 'google' ||
		normalized === 'openrouter' ||
		normalized === 'perplexity' ||
		normalized === 'ollama'
	) {
		return normalized;
	}
	return undefined;
}
