import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useSearchSessionStore } from '../store/searchSessionStore';
import { StreamdownIsolated } from '@/ui/component/mine/StreamdownIsolated';

export const V2ReportSection: React.FC = () => {
	const chunks = useSearchSessionStore((s) => s.v2ReportChunks);
	const complete = useSearchSessionStore((s) => s.v2ReportComplete);

	const markdown = useMemo(() => chunks.join(''), [chunks]);

	if (!markdown) return null;

	return (
		<motion.div
			className="pktw-mt-3"
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.4, ease: 'easeOut' }}
		>
			<StreamdownIsolated isAnimating={!complete}>
				{markdown}
			</StreamdownIsolated>
		</motion.div>
	);
};
