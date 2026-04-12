import React, { useMemo } from 'react';
import { useSearchSessionStore } from '../store/searchSessionStore';
import { StreamdownIsolated } from '@/ui/component/mine/StreamdownIsolated';

export const V2ReportSection: React.FC = () => {
	const chunks = useSearchSessionStore((s) => s.v2ReportChunks);
	const complete = useSearchSessionStore((s) => s.v2ReportComplete);

	const markdown = useMemo(() => chunks.join(''), [chunks]);

	if (!markdown) return null;

	return (
		<div className="pktw-mt-3">
			<StreamdownIsolated isAnimating={!complete}>
				{markdown}
			</StreamdownIsolated>
		</div>
	);
};
