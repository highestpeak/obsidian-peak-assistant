import React from 'react';
import { ShieldCheck, FileText, Clock, Brain, Tag, ChevronDown, ChevronRight } from 'lucide-react';
import type { LintDimension, LintScanResult, LintSignalId } from '@/service/lint/types';
import { LINT_DIMENSIONS } from '@/service/lint/types';
import { useVaultLintStore } from '@/ui/store/vaultLintStore';
import { SIGNAL_LABELS, SEVERITY_CONFIG } from '../constants';

const DIMENSION_META: Record<LintDimension, { label: string; icon: React.ElementType }> = {
	structural: { label: 'Structural', icon: ShieldCheck },
	content: { label: 'Content', icon: FileText },
	temporal: { label: 'Temporal', icon: Clock },
	semantic: { label: 'Semantic', icon: Brain },
	tags: { label: 'Tags', icon: Tag },
};

function getDimBarColor(score: number): string {
	if (score >= 90) return 'pktw-bg-green-500';
	if (score >= 70) return 'pktw-bg-blue-500';
	if (score >= 50) return 'pktw-bg-amber-500';
	return 'pktw-bg-red-500';
}

interface DimensionBarsProps {
	scan: LintScanResult;
}

export function DimensionBars({ scan }: DimensionBarsProps) {
	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-1">
			<span className="pktw-text-xs pktw-font-medium pktw-uppercase pktw-tracking-wider pktw-text-muted-foreground pktw-mb-1">
				Dimensions
			</span>
			{LINT_DIMENSIONS.map((dim) => (
				<DimensionRow key={dim} dimension={dim} scan={scan} />
			))}
		</div>
	);
}

function DimensionRow({ dimension, scan }: { dimension: LintDimension; scan: LintScanResult }) {
	const expandedSignal = useVaultLintStore((s) => s.expandedSignal);
	const setExpandedSignal = useVaultLintStore((s) => s.setExpandedSignal);

	const meta = DIMENSION_META[dimension];
	const Icon = meta.icon;
	const score = scan.dimensionScores[dimension];

	// Get signals for this dimension
	const dimensionSignals = Object.entries(scan.signalCounts)
		.filter(([signalId]) => signalBelongsToDimension(signalId as LintSignalId, dimension))
		.map(([signalId, count]) => ({ signalId: signalId as LintSignalId, count: count ?? 0 }))
		.filter((s) => s.count > 0);

	const isExpanded = dimensionSignals.some((s) => expandedSignal === s.signalId);

	const handleClick = () => {
		if (dimensionSignals.length === 0) return;
		// Toggle: if any signal in this dimension is expanded, collapse. Otherwise expand first.
		if (isExpanded) {
			setExpandedSignal(null);
		} else if (dimensionSignals.length > 0) {
			setExpandedSignal(dimensionSignals[0].signalId);
		}
	};

	const Chevron = isExpanded ? ChevronDown : ChevronRight;

	return (
		<div>
			<div
				className="pktw-flex pktw-items-center pktw-gap-2 pktw-py-1.5 pktw-px-2 pktw-rounded-md hover:pktw-bg-accent pktw-cursor-pointer pktw-select-none"
				onClick={handleClick}
			>
				{dimensionSignals.length > 0 ? (
					<Chevron className="pktw-h-3.5 pktw-w-3.5 pktw-text-muted-foreground pktw-shrink-0" />
				) : (
					<div className="pktw-w-3.5 pktw-shrink-0" />
				)}
				<Icon className="pktw-h-4 pktw-w-4 pktw-text-muted-foreground pktw-shrink-0" />
				<span className="pktw-text-sm pktw-flex-1">{meta.label}</span>
				<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-w-32">
					<div className="pktw-h-1.5 pktw-flex-1 pktw-rounded-full pktw-bg-muted">
						<div
							className={`pktw-h-full pktw-rounded-full pktw-transition-all pktw-duration-500 ${getDimBarColor(score)}`}
							style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
						/>
					</div>
					<span className="pktw-text-xs pktw-tabular-nums pktw-text-muted-foreground pktw-w-7 pktw-text-right">
						{Math.round(score)}
					</span>
				</div>
			</div>

			{isExpanded && dimensionSignals.length > 0 && (
				<div className="pktw-ml-9 pktw-mb-1">
					{dimensionSignals.map(({ signalId, count }) => {
						const finding = scan.findings.find((f) => f.signalId === signalId);
						const severity = finding?.severity ?? 'info';
						const config = SEVERITY_CONFIG[severity];
						const SevIcon = config.icon;
						return (
							<div
								key={signalId}
								className="pktw-flex pktw-items-center pktw-gap-2 pktw-py-1 pktw-px-2 pktw-text-xs"
							>
								<SevIcon className={`pktw-h-3 pktw-w-3 pktw-shrink-0 ${config.color}`} />
								<span className="pktw-flex-1 pktw-text-muted-foreground">
									{SIGNAL_LABELS[signalId] ?? signalId}
								</span>
								<span className="pktw-tabular-nums pktw-text-muted-foreground">{count}</span>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}

function signalBelongsToDimension(signalId: LintSignalId, dimension: LintDimension): boolean {
	const prefixMap: Record<string, LintDimension> = {
		'S-': 'structural',
		'C-': 'content',
		'T-': 'temporal',
		'M-': 'semantic',
		'G-': 'tags',
	};
	const prefix = signalId.slice(0, 2);
	return prefixMap[prefix] === dimension;
}
