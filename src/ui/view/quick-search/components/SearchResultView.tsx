import React from 'react';
import { useSearchSessionStore } from '../store/searchSessionStore';
import { StepList } from './StepList';
import { AIAnalysisPreStreamingState } from './ai-analysis-state/AIAnalysisPreStreamingState';
import { AIAnalysisErrorState } from './ai-analysis-state/AIAnalysisErrorState';
import { RecentAIAnalysis } from './ai-analysis-sections/RecentAIAnalysis';
import { createOpenSourceCallback } from '../callbacks/open-source-file';
import { V2SearchResultView } from './V2SearchResultView';

// ---------------------------------------------------------------------------
// Token stats banner — shown once analysis has phase usage data
// ---------------------------------------------------------------------------

const TokenStatsBanner: React.FC = () => {
	const phaseUsages = useSearchSessionStore((s) => s.phaseUsages);
	const totalUsage = useSearchSessionStore((s) => s.usage);
	if (phaseUsages.length === 0 && !totalUsage) return null;

	// Aggregate per model
	const byModel = new Map<string, { input: number; output: number }>();
	for (const p of phaseUsages) {
		const key = p.modelId || 'unknown';
		const existing = byModel.get(key) ?? { input: 0, output: 0 };
		byModel.set(key, { input: existing.input + p.inputTokens, output: existing.output + p.outputTokens });
	}

	// Total from phaseUsages (may be partial — recon not tracked per-phase)
	const phaseTotal = phaseUsages.reduce((acc, p) => ({ input: acc.input + p.inputTokens, output: acc.output + p.outputTokens }), { input: 0, output: 0 });
	// Use store total if available and larger
	const totalIn = Math.max(phaseTotal.input, totalUsage?.inputTokens ?? 0);
	const totalOut = Math.max(phaseTotal.output, totalUsage?.outputTokens ?? 0);

	const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

	return (
		<div className="pktw-mt-3 pktw-px-2 pktw-py-2 pktw-rounded pktw-bg-[#f9fafb] pktw-border pktw-border-[#e5e7eb]">
			<div className="pktw-flex pktw-items-center pktw-gap-3 pktw-flex-wrap">
				<span className="pktw-text-[10px] pktw-text-[#6b7280] pktw-font-medium">Tokens used</span>
				{(totalIn > 0 || totalOut > 0) && (
					<span className="pktw-text-[10px] pktw-text-[#374151] pktw-tabular-nums">
						{fmt(totalIn)} in · {fmt(totalOut)} out
					</span>
				)}
				{Array.from(byModel.entries()).map(([modelId, usage]) => (
					<span key={modelId} className="pktw-text-[10px] pktw-text-[#9ca3af] pktw-tabular-nums">
						{modelId}: {fmt(usage.input + usage.output)}
					</span>
				))}
			</div>
		</div>
	);
};

export interface SearchResultViewProps {
	onClose?: () => void;
	onRetry?: () => void;
	onApprove?: () => void;
	onRegenerateSection?: (id: string, prompt?: string) => void;
}

export const SearchResultView: React.FC<SearchResultViewProps> = ({ onClose, onRetry, onApprove, onRegenerateSection }) => {
	const error = useSearchSessionStore((s) => s.error);
	const steps = useSearchSessionStore((s) => s.steps);
	const startedAt = useSearchSessionStore((s) => s.startedAt);
	const duration = useSearchSessionStore((s) => s.duration);

	const isV2Active = useSearchSessionStore((s) => s.v2Active);
	const isStreaming = useSearchSessionStore((s) => s.status === 'streaming');

	const handleOpenWikilink = createOpenSourceCallback(onClose);

	// Error state
	if (error) {
		return (
			<AIAnalysisErrorState
				error={error}
				onRetry={onRetry ?? (() => {})}
			/>
		);
	}

	// V2 mode — show result view even if no steps yet (agent is thinking)
	if (isV2Active) {
		return <V2SearchResultView onClose={onClose} onRetry={onRetry} onApprove={onApprove} onRegenerateSection={onRegenerateSection} />;
	}

	// Idle state: no steps yet, no error
	if (steps.length === 0) {
		return (
			<>
				<AIAnalysisPreStreamingState />
				{!isStreaming && <RecentAIAnalysis onClose={onClose} />}
			</>
		);
	}

	// V1 steps available
	return (
		<div>
			<StepList
				steps={steps}
				onClose={onClose}
				startedAtMs={startedAt}
				durationMs={duration}
				onOpenWikilink={handleOpenWikilink}
			/>
			<TokenStatsBanner />
		</div>
	);
};
