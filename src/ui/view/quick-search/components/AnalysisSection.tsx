import React from 'react';
import { Sparkles } from 'lucide-react';
import { Streamdown } from 'streamdown';
import { motion } from 'framer-motion';
import { IntelligenceFrame } from './IntelligenceFrame';

/**
 * AI analysis result section component with Apple-style visual effects
 */
export const AnalysisSection: React.FC<{ summary: string; isStreaming: boolean }> = ({ summary, isStreaming }) => (
	<motion.div
		initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
		animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
		transition={{ 
			duration: 0.5, 
			ease: [0.25, 0.46, 0.45, 0.94] // Apple-style ease curve
		}}
	>
		<IntelligenceFrame isActive={isStreaming}>
			<div className="pktw-p-4">
				<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-3">
					<motion.div
						animate={isStreaming ? { rotate: 360 } : { rotate: 0 }}
						transition={isStreaming ? { 
							duration: 2, 
							repeat: Infinity, 
							ease: "linear" 
						} : { duration: 0.3 }}
					>
						<Sparkles className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed]" />
					</motion.div>
					<span className="pktw-font-semibold pktw-text-[#2e3338] pktw-text-lg">AI Analysis</span>
					{isStreaming && (
						<motion.span
							className="pktw-text-xs pktw-text-[#7c3aed] pktw-font-normal"
							animate={{ opacity: [0.5, 1, 0.5] }}
							transition={{ duration: 1.5, repeat: Infinity }}
						>
							analyzing...
						</motion.span>
					)}
				</div>
				<div className="pktw-space-y-3 pktw-text-sm pktw-text-[#2e3338] pktw-leading-relaxed">
					<div className="pktw-select-text" data-streamdown-root>
						{summary ? (
							<Streamdown isAnimating={isStreaming}>{summary}</Streamdown>
						) : (
							<span className="pktw-text-[#999999]">No summary available.</span>
						)}
					</div>
				</div>
			</div>
		</IntelligenceFrame>
	</motion.div>
);