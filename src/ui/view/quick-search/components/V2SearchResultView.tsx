import React from 'react';
import { useSearchSessionStore } from '../store/searchSessionStore';
import { V2StepList } from './steps/V2StepList';
import { V2ReportSection } from './V2ReportSection';

interface V2SearchResultViewProps {
	onClose?: () => void;
	onRetry?: () => void;
}

const V2TokenStatsBanner: React.FC = () => {
	const usage = useSearchSessionStore((s) => s.usage);
	const duration = useSearchSessionStore((s) => s.duration);
	const status = useSearchSessionStore((s) => s.status);
	if (status !== 'completed' || !usage) return null;

	const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
	const durationStr = duration ? `${(duration / 1000).toFixed(0)}s` : '';

	return (
		<div className="pktw-mt-3 pktw-px-2 pktw-py-1.5 pktw-rounded pktw-bg-gray-50 pktw-border pktw-border-gray-100">
			<span className="pktw-text-[10px] pktw-text-gray-400 pktw-flex pktw-items-center pktw-gap-2 pktw-flex-wrap">
				{durationStr && <span>{durationStr}</span>}
				<span>{fmt(usage.inputTokens + usage.outputTokens)} tokens</span>
			</span>
		</div>
	);
};

export const V2SearchResultView: React.FC<V2SearchResultViewProps> = () => {
	const hasReport = useSearchSessionStore((s) => s.v2ReportChunks.length > 0);

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-0">
			{/* Step cards — compact exploration log */}
			<div className="pktw-px-1 pktw-py-1 pktw-bg-[#fafafa] pktw-rounded pktw-border pktw-border-gray-100">
				<V2StepList />
			</div>

			{/* Report — full-width markdown, visually separated */}
			{hasReport && (
				<div className="pktw-mt-4">
					<V2ReportSection />
				</div>
			)}

			<V2TokenStatsBanner />
		</div>
	);
};
