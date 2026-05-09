import React from 'react';
import { Coins, Hash, Timer, Zap } from 'lucide-react';
import type { UsageKPIs } from '@/service/usage/types';

interface KpiCardsProps {
	kpis: UsageKPIs | null;
	loading: boolean;
}

function formatNumber(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
	return n.toLocaleString();
}

function formatCost(n: number): string {
	if (n >= 1) return `$${n.toFixed(2)}`;
	if (n >= 0.01) return `$${n.toFixed(3)}`;
	return `$${n.toFixed(4)}`;
}

function formatDuration(ms: number): string {
	if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
	return `${Math.round(ms)}ms`;
}

function pctChange(current: number, prev: number): number | null {
	if (prev === 0) return null;
	return ((current - prev) / prev) * 100;
}

function ChangeIndicator({ pct, invertColor }: { pct: number | null; invertColor?: boolean }) {
	if (pct === null) return null;
	const isUp = pct > 0;
	// For cost, up = bad (red); for tokens, up = neutral info
	const color = invertColor
		? isUp
			? 'var(--pk-error, #ef4444)'
			: 'var(--pk-success, #22c55e)'
		: isUp
			? 'var(--pk-success, #22c55e)'
			: 'var(--pk-error, #ef4444)';

	return (
		<span className="pktw-text-xs pktw-font-medium" style={{ color }}>
			{isUp ? '+' : ''}{pct.toFixed(1)}%
		</span>
	);
}

function SkeletonCard() {
	return (
		<div
			className="pktw-rounded-lg pktw-p-4 pktw-animate-pulse"
			style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--background-modifier-border)' }}
		>
			<div className="pktw-h-4 pktw-w-24 pktw-rounded pktw-mb-3" style={{ backgroundColor: 'var(--background-modifier-border)' }} />
			<div className="pktw-h-8 pktw-w-32 pktw-rounded" style={{ backgroundColor: 'var(--background-modifier-border)' }} />
		</div>
	);
}

interface CardProps {
	icon: React.ReactNode;
	label: string;
	value: string;
	change: number | null;
	invertColor?: boolean;
}

function Card({ icon, label, value, change, invertColor }: CardProps) {
	return (
		<div
			className="pktw-rounded-lg pktw-p-4 pktw-flex pktw-flex-col pktw-gap-2"
			style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--background-modifier-border)' }}
		>
			<div className="pktw-flex pktw-items-center pktw-gap-2">
				<span style={{ color: 'var(--text-muted)' }}>{icon}</span>
				<span className="pktw-text-xs pktw-font-medium" style={{ color: 'var(--text-muted)' }}>{label}</span>
			</div>
			<div className="pktw-flex pktw-items-baseline pktw-gap-2">
				<span className="pktw-text-2xl pktw-font-bold" style={{ color: 'var(--text-normal)' }}>{value}</span>
				<ChangeIndicator pct={change} invertColor={invertColor} />
			</div>
		</div>
	);
}

export function KpiCards({ kpis, loading }: KpiCardsProps) {
	if (loading || !kpis) {
		return (
			<div className="pktw-grid pktw-grid-cols-2 lg:pktw-grid-cols-4 pktw-gap-4">
				{Array.from({ length: 4 }).map((_, i) => (
					<SkeletonCard key={i} />
				))}
			</div>
		);
	}

	const tokenChange = pctChange(kpis.totalTokens, kpis.prevTotalTokens);
	const costChange = pctChange(kpis.totalCostUsd, kpis.prevTotalCostUsd);

	return (
		<div className="pktw-grid pktw-grid-cols-2 lg:pktw-grid-cols-4 pktw-gap-4">
			<Card
				icon={<Zap size={16} />}
				label="Total Tokens"
				value={formatNumber(kpis.totalTokens)}
				change={tokenChange}
			/>
			<Card
				icon={<Coins size={16} />}
				label="Estimated Cost"
				value={formatCost(kpis.totalCostUsd)}
				change={costChange}
				invertColor
			/>
			<Card
				icon={<Hash size={16} />}
				label="API Calls"
				value={formatNumber(kpis.callCount)}
				change={null}
			/>
			<Card
				icon={<Timer size={16} />}
				label="Avg Latency"
				value={formatDuration(kpis.avgDurationMs)}
				change={null}
			/>
		</div>
	);
}
