import React from 'react';
import { Activity, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { LintTrendPoint } from '@/service/lint/types';

interface ScoreRingProps {
	score: number;
	lastScanTimestamp: number | null;
	trendHistory: LintTrendPoint[];
}

function getScoreColor(score: number): string {
	if (score >= 90) return 'pktw-text-green-500';
	if (score >= 70) return 'pktw-text-blue-500';
	if (score >= 50) return 'pktw-text-amber-500';
	return 'pktw-text-red-500';
}

function getScoreBgColor(score: number): string {
	if (score >= 90) return 'pktw-bg-green-500';
	if (score >= 70) return 'pktw-bg-blue-500';
	if (score >= 50) return 'pktw-bg-amber-500';
	return 'pktw-bg-red-500';
}

function getScoreTrackColor(score: number): string {
	if (score >= 90) return 'pktw-bg-green-500/20';
	if (score >= 70) return 'pktw-bg-blue-500/20';
	if (score >= 50) return 'pktw-bg-amber-500/20';
	return 'pktw-bg-red-500/20';
}

function getScoreLabel(score: number): string {
	if (score >= 90) return 'EXCELLENT';
	if (score >= 70) return 'GOOD';
	if (score >= 50) return 'NEEDS ATTENTION';
	return 'CRITICAL';
}

function formatRelativeTime(timestamp: number): string {
	const diffMs = Date.now() - timestamp;
	const minutes = Math.floor(diffMs / 60000);
	if (minutes < 1) return 'just now';
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

function getTrendDelta(trendHistory: LintTrendPoint[]): number | null {
	if (trendHistory.length < 2) return null;
	const latest = trendHistory[0];
	const previous = trendHistory[1];
	return latest.healthScore - previous.healthScore;
}

export function ScoreRing({ score, lastScanTimestamp, trendHistory }: ScoreRingProps) {
	const delta = getTrendDelta(trendHistory);

	return (
		<div className="pktw-flex pktw-flex-col pktw-items-center pktw-gap-3 pktw-py-4">
			<div className="pktw-flex pktw-items-center pktw-gap-2">
				<Activity className="pktw-h-4 pktw-w-4 pktw-text-muted-foreground" />
				<span className="pktw-text-xs pktw-font-medium pktw-uppercase pktw-tracking-wider pktw-text-muted-foreground">
					Health Score
				</span>
			</div>

			<span className={`pktw-text-5xl pktw-font-bold pktw-tabular-nums ${getScoreColor(score)}`}>
				{Math.round(score)}
			</span>

			<span className={`pktw-text-xs pktw-font-semibold pktw-uppercase pktw-tracking-wider ${getScoreColor(score)}`}>
				{getScoreLabel(score)}
			</span>

			{/* Progress bar */}
			<div className={`pktw-h-2 pktw-w-48 pktw-rounded-full ${getScoreTrackColor(score)}`}>
				<div
					className={`pktw-h-full pktw-rounded-full pktw-transition-all pktw-duration-500 ${getScoreBgColor(score)}`}
					style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
				/>
			</div>

			{/* Last scan + trend */}
			<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-text-xs pktw-text-muted-foreground">
				{lastScanTimestamp && (
					<span>Last scan: {formatRelativeTime(lastScanTimestamp)}</span>
				)}
				{delta !== null && <TrendBadge delta={delta} />}
			</div>
		</div>
	);
}

function TrendBadge({ delta }: { delta: number }) {
	if (delta === 0) {
		return (
			<span className="pktw-inline-flex pktw-items-center pktw-gap-0.5 pktw-text-muted-foreground">
				<Minus className="pktw-h-3 pktw-w-3" />
				<span>no change</span>
			</span>
		);
	}
	const isUp = delta > 0;
	const Icon = isUp ? TrendingUp : TrendingDown;
	const colorClass = isUp ? 'pktw-text-green-500' : 'pktw-text-red-500';
	return (
		<span className={`pktw-inline-flex pktw-items-center pktw-gap-0.5 ${colorClass}`}>
			<Icon className="pktw-h-3 pktw-w-3" />
			<span>{isUp ? '+' : ''}{delta}</span>
		</span>
	);
}
