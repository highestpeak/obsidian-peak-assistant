/**
 * Media-generation log rows for the Usage Dashboard (gap 2).
 *
 * Reads `usage_log` rows where `feature='media_generation'` (via
 * `UsageTrackingService.getRecentCalls`) and shapes them into a display
 * model. Cost is ALWAYS labelled "estimated" — see composeMediaGenerationService.ts
 * where `metadata.costConfidence` is stamped `'estimated'` for every preset
 * (a design invariant, not a per-model policy — flip to
 * `'provider-reported'` in the preset when a real bill arrives).
 */

import { useEffect, useState } from 'react';
import { useServiceContext } from '@/ui/context/ServiceContext';
import type { UsageLogRow } from '@/core/storage/sqlite/ddl';
import type { TimeRange } from '@/service/usage/types';

/** One row in the media details table. Pure data — no React types. */
export interface MediaLogRow {
	id: number;
	createdAt: number;
	/** `image.success`, `video.failure`, etc. Split for the display column. */
	kind: string;
	outcome: 'success' | 'failure' | 'unknown';
	route: string;
	provider: string;
	model: string;
	presetId?: string;
	jobId?: string;
	billingUnit?: string;
	estimatedCostUsd: number;
	costConfidence: 'estimated' | 'provider-reported';
	durationSeconds: number;
	quantity?: number;
	aspectRatio?: string;
	errorMessage?: string;
}

interface MediaLogMetadata {
	costConfidence?: 'estimated' | 'provider-reported';
	billingUnit?: string;
	route?: string;
	jobId?: string;
	runId?: string;
	presetId?: string;
	durationSeconds?: number;
	quantity?: number;
	aspectRatio?: string;
	errorMessage?: string;
}

/**
 * Map a usage_log row to the display shape. Exported so a unit test can
 * exercise every branch (kind parse, missing metadata, outcome fallback,
 * estimated-vs-provider-reported).
 */
export function mapMediaLogRow(row: UsageLogRow): MediaLogRow {
	let metadata: MediaLogMetadata = {};
	if (row.metadata_json) {
		try {
			const parsed = JSON.parse(row.metadata_json);
			if (parsed && typeof parsed === 'object') metadata = parsed as MediaLogMetadata;
		} catch { /* leave metadata empty — row still renders */ }
	}
	const [kindPart, outcomePart] = String(row.action ?? '').split('.', 2);
	const outcome: MediaLogRow['outcome'] =
		outcomePart === 'success' ? 'success'
			: outcomePart === 'failure' ? 'failure'
				: 'unknown';
	return {
		id: row.id,
		createdAt: row.created_at,
		kind: kindPart || row.action || 'media',
		outcome,
		route: metadata.route ?? 'unknown',
		provider: row.provider || 'unknown',
		model: row.model || 'unknown',
		presetId: metadata.presetId,
		jobId: metadata.jobId,
		billingUnit: metadata.billingUnit,
		estimatedCostUsd: Number(row.cost_usd) || 0,
		// Defensive: default to `estimated` when metadata missing — media
		// costs are never a settled bill unless the preset flips it.
		costConfidence: metadata.costConfidence ?? 'estimated',
		durationSeconds: Math.round(Number(row.duration_ms) || 0) / 1000,
		quantity: metadata.quantity,
		aspectRatio: metadata.aspectRatio,
		errorMessage: metadata.errorMessage,
	};
}

export function useMediaLogs(range: TimeRange): { rows: MediaLogRow[]; loading: boolean } {
	const { usageServices } = useServiceContext();
	const [rows, setRows] = useState<MediaLogRow[]>([]);
	const [loading, setLoading] = useState(true);
	useEffect(() => {
		if (!usageServices) {
			setLoading(false);
			return;
		}
		let cancelled = false;
		setLoading(true);
		void usageServices.tracking.getRecentCalls(range, 'media_generation', 200, 0)
			.then((raw) => {
				if (cancelled) return;
				setRows(raw.map(mapMediaLogRow));
				setLoading(false);
			})
			.catch(() => {
				if (cancelled) return;
				setRows([]);
				setLoading(false);
			});
		return () => { cancelled = true; };
	}, [range, usageServices]);
	return { rows, loading };
}
