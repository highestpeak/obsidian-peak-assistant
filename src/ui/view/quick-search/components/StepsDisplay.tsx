import React, { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import { Activity, Sparkles, ChevronDown, ChevronRight, Check } from 'lucide-react';
import { AIAnalysisStep, StepsUISkipShouldSkip } from '@/ui/view/quick-search/store/aiAnalysisStore';
import { motion } from 'framer-motion';
import { AnalysisTimer } from './IntelligenceFrame';
import { Streamdown } from 'streamdown';

export type StreamingDisplayMethods = {
	appendText: (text: string) => void;
	clear: () => void;
};

/**
 * Live timer that updates using requestAnimationFrame for smooth display
 */
const LiveTimer: React.FC<{ startedAtMs: number }> = ({ startedAtMs }) => {
	const [elapsed, setElapsed] = useState(0);
	const rafRef = useRef<number>();
	
	useEffect(() => {
		const update = () => {
			setElapsed(Date.now() - startedAtMs);
			rafRef.current = requestAnimationFrame(update);
		};
		rafRef.current = requestAnimationFrame(update);
		return () => {
			if (rafRef.current) {
				cancelAnimationFrame(rafRef.current);
			}
		};
	}, [startedAtMs]);
	
	const seconds = (elapsed / 1000).toFixed(1);
	return (
		<span className="pktw-text-[#7c3aed] pktw-font-mono pktw-text-xs pktw-tabular-nums">
			{seconds}s...
		</span>
	);
};

/**
 * Completed step duration display (static)
 */
const CompletedDuration: React.FC<{ startedAtMs?: number; endedAtMs?: number }> = ({ 
	startedAtMs, 
	endedAtMs 
}) => {
	if (!startedAtMs || !endedAtMs) return null;
	const duration = ((endedAtMs - startedAtMs) / 1000).toFixed(1);
	return (
		<span className="pktw-text-[#9ca3af] pktw-font-mono pktw-text-xs pktw-tabular-nums">
			{duration}s
		</span>
	);
};

/**
 * Pulsating circle indicator for running step
 */
const RunningIndicator: React.FC = () => (
	<div className="pktw-relative pktw-w-3 pktw-h-3 pktw-flex pktw-items-center pktw-justify-center">
		{/* Ripple effect */}
		<motion.div
			className="pktw-absolute pktw-w-3 pktw-h-3 pktw-rounded-full pktw-bg-[#7c3aed]"
			animate={{
				scale: [1, 1.8, 1.8],
				opacity: [0.6, 0, 0]
			}}
			transition={{
				duration: 1.5,
				repeat: Infinity,
				ease: "easeOut"
			}}
		/>
		{/* Center dot */}
		<motion.div
			className="pktw-w-2 pktw-h-2 pktw-rounded-full pktw-bg-[#7c3aed]"
			animate={{
				scale: [1, 1.1, 1]
			}}
			transition={{
				duration: 0.8,
				repeat: Infinity,
				ease: "easeInOut"
			}}
		/>
	</div>
);

/**
 * Checkmark indicator for completed step with micro-animation
 */
const CompletedIndicator: React.FC = () => (
	<motion.div
		className="pktw-w-3 pktw-h-3 pktw-rounded-full pktw-bg-[#10b981] pktw-flex pktw-items-center pktw-justify-center"
		initial={{ scale: 0, rotate: -180 }}
		animate={{ scale: 1, rotate: 0 }}
		transition={{ type: "spring", stiffness: 260, damping: 20 }}
	>
		<Check className="pktw-w-2 pktw-h-2 pktw-text-white" strokeWidth={3} />
	</motion.div>
);

/**
 * Hook for incremental text rendering with batching and auto-scroll
 */
const useIncrementalRenderer = (
	containerRef: React.RefObject<HTMLElement>,
	scrollContainerRef?: React.RefObject<HTMLElement>,
	delay: number = 50
) => {
	const pendingChunksRef = useRef<string[]>([]);
	const renderTimerRef = useRef<NodeJS.Timeout | null>(null);
	const userScrolledRef = useRef<boolean>(false);
	const lastScrollTopRef = useRef<number>(0);

	const appendText = useCallback((text: string) => {
		// Add to pending buffer
		pendingChunksRef.current.push(text);

		// If timer is already running, don't start another one
		if (renderTimerRef.current) return;

		// Function to attempt rendering
		const attemptRender = () => {
			const container = containerRef.current;
			if (container) {
				if (pendingChunksRef.current.length > 0) {
					// Append all pending chunks to DOM directly
					for (const chunk of pendingChunksRef.current) {
						container.insertAdjacentText('beforeend', chunk);
					}
					// Clear pending chunks
					pendingChunksRef.current = [];

					// Auto-scroll after rendering (only if user hasn't manually scrolled)
					if (!userScrolledRef.current) {
						const scrollTarget = scrollContainerRef?.current || container;
						scrollTarget.scrollTop = scrollTarget.scrollHeight;
					}
				}

				// Clear timer
				renderTimerRef.current = null;
			} else {
				// Container not ready yet, try again in 10ms
				renderTimerRef.current = setTimeout(attemptRender, 10);
			}
		};

		// Schedule initial render attempt after specified delay
		renderTimerRef.current = setTimeout(attemptRender, delay);
	}, [containerRef, scrollContainerRef, delay]);

	const handleScroll = useCallback(() => {
		const scrollTarget = scrollContainerRef?.current || containerRef.current;
		if (scrollTarget) {
			const currentScrollTop = scrollTarget.scrollTop;
			const maxScrollTop = scrollTarget.scrollHeight - scrollTarget.clientHeight;

			// If user scrolled up from the bottom, mark as manually scrolled
			if (currentScrollTop < lastScrollTopRef.current && currentScrollTop < maxScrollTop - 10) {
				userScrolledRef.current = true;
			}

			// If user scrolled back to bottom, reset the manual scroll flag
			if (currentScrollTop >= maxScrollTop - 10) {
				userScrolledRef.current = false;
			}

			lastScrollTopRef.current = currentScrollTop;
		}
	}, [scrollContainerRef, containerRef]);

	const resetUserScroll = useCallback(() => {
		userScrolledRef.current = false;
		lastScrollTopRef.current = 0;
		const scrollTarget = scrollContainerRef?.current || containerRef.current;
		if (scrollTarget) {
			lastScrollTopRef.current = scrollTarget.scrollTop;
		}
	}, [scrollContainerRef, containerRef]);

	const clear = useCallback(() => {
		const container = containerRef.current;
		if (container) {
			container.textContent = '';
		}
		// Clear pending chunks and timer
		pendingChunksRef.current = [];
		if (renderTimerRef.current) {
			clearTimeout(renderTimerRef.current);
			renderTimerRef.current = null;
		}
		// Reset scroll tracking
		resetUserScroll();
	}, [containerRef, resetUserScroll]);

	// Setup scroll event listener and cleanup on unmount
	useEffect(() => {
		const scrollTarget = scrollContainerRef?.current || containerRef.current;
		if (scrollTarget) {
			scrollTarget.addEventListener('scroll', handleScroll);
			// Initialize last scroll top
			lastScrollTopRef.current = scrollTarget.scrollTop;
		}

		return () => {
			if (scrollTarget) {
				scrollTarget.removeEventListener('scroll', handleScroll);
			}
			pendingChunksRef.current = [];
			if (renderTimerRef.current) {
				clearTimeout(renderTimerRef.current);
				renderTimerRef.current = null;
			}
		};
	}, [scrollContainerRef, containerRef, handleScroll]);

	return { appendText, clear, resetUserScroll };
};

/**
 * Streaming steps display component - shows all steps (completed + current) in a continuous scrolling area
 * Inspired by the thinkingSteps design pattern with incremental rendering
 */
export const StreamingStepsDisplay: React.FC<{
	steps: AIAnalysisStep[];
	currentStep: AIAnalysisStep;
	stepTrigger: number;
	registerCurrentStepRender?: (methods: StreamingDisplayMethods) => void;
	startedAtMs?: number | null;
	isRunning?: boolean;
	finalDurationMs?: number | null;
}> = ({
	steps,
	currentStep,
	stepTrigger,
	registerCurrentStepRender,
	startedAtMs,
	isRunning,
	finalDurationMs,
}) => {
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const currentStepContainerRef = useRef<HTMLDivElement>(null);
	const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

	// Use the shared incremental renderer hook
	const { appendText, clear, resetUserScroll } = useIncrementalRenderer(
		currentStepContainerRef,
		scrollContainerRef,
		50 // 150ms delay for step rendering
	);

	// reset current step container and scroll state when step changes
	useEffect(() => {
		clear();
		resetUserScroll();
	}, [stepTrigger, clear, resetUserScroll]);

	const formatStepType = (type: string) => {
		return type.split('-').map(word =>
			word.charAt(0).toUpperCase() + word.slice(1)
		).join(' ');
	};

	const toggleStepExpansion = useCallback((index: number) => {
		setExpandedSteps(prev => {
			const newSet = new Set(prev);
			if (newSet.has(index)) {
				newSet.delete(index);
			} else {
				newSet.add(index);
			}
			return newSet;
		});
	}, []);

	// Pre-compute full text for completed steps only
	const stepsWithFullText = useMemo(() => {
		return steps.map(step => ({
			...step,
			fullText: step.textChunks.join('').trim()
		}));
	}, [steps]);

	// Create methods object that can be reused
	const methods = useMemo(() => ({
		appendText,
		clear
	}), [appendText, clear]);

	// Register methods with parent component
	useEffect(() => {
		if (registerCurrentStepRender) {
			registerCurrentStepRender(methods);
		}
	}, [registerCurrentStepRender, methods]);

	return (
		<div className="pktw-bg-[#f9fafb] pktw-rounded-lg pktw-p-4 pktw-border pktw-border-[#e5e7eb] pktw-max-h-96">
			<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-3">
				<Activity className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed]" />
				<span className="pktw-text-sm pktw-font-semibold pktw-text-[#2e3338]">Analysis Steps</span>
				<div className="pktw-flex-1" />
				{startedAtMs && isRunning !== undefined ? (
					<AnalysisTimer
						startedAtMs={startedAtMs}
						isRunning={isRunning}
						finalDurationMs={finalDurationMs ?? undefined}
					/>
				) : null}
			</div>

			<div
				ref={scrollContainerRef}
				className="pktw-h-64 pktw-overflow-y-auto pktw-scroll-smooth"
			>
				{/* Completed Steps */}
				{stepsWithFullText.filter(step => !StepsUISkipShouldSkip.has(step.type)).map((step, index) => {
					const isExpanded = expandedSteps.has(index);
					return (
						<div
							key={`completed-${index}`}
							className="pktw-text-xs pktw-text-[#6c757d] pktw-mb-3"
						>
							<div
								className="pktw-font-medium pktw-text-[#2e3338] pktw-mb-1 pktw-cursor-pointer pktw-flex pktw-items-center pktw-gap-2 hover:pktw-text-[#7c3aed] pktw-transition-colors"
								onClick={() => toggleStepExpansion(index)}
							>
								<CompletedIndicator />
								{isExpanded ? (
									<ChevronDown className="pktw-w-3 pktw-h-3" />
								) : (
									<ChevronRight className="pktw-w-3 pktw-h-3" />
								)}
								<span className="pktw-flex-1">{formatStepType(step.type)}</span>
								<CompletedDuration startedAtMs={step.startedAtMs} endedAtMs={step.endedAtMs} />
							</div>

							{/* Expand/Collapse without layout reflow animation */}
							<div
								className="pktw-overflow-hidden pktw-transition-[max-height,opacity] pktw-duration-200"
								style={{
									maxHeight: isExpanded ? 480 : 0,
									opacity: isExpanded ? 1 : 0,
								}}
							>
								<div className="pktw-leading-relaxed pktw-break-words pktw-ml-8 pktw-mt-1">
									{step.fullText}
								</div>
								{step.extra && Object.keys(step.extra).length > 0 && (
									<div className="pktw-text-[#999999] pktw-mt-1 pktw-text-xs pktw-ml-8 pktw-space-y-0.5">
										{Object.entries(step.extra).map(([key, value]) => (
											<div key={key} className="pktw-truncate">
												<span className="pktw-text-[#6b7280]">{key}:</span>{' '}
												{typeof value === 'object' ? JSON.stringify(value) : String(value)}
											</div>
										))}
									</div>
								)}
							</div>
						</div>
					);
				})}

				{/* Current Step */}
				{!StepsUISkipShouldSkip.has(currentStep.type) && (
					<div className="pktw-text-xs pktw-text-[#6c757d]">
						<div className="pktw-sticky pktw-top-0 pktw-bg-[#f9fafb] pktw-z-10 pktw-pb-2 pktw-border-b pktw-border-[#e5e7eb]">
							<div className="pktw-font-medium pktw-text-[#2e3338] pktw-mb-1 pktw-flex pktw-items-center pktw-gap-2">
								<RunningIndicator />
								<span className="pktw-flex-1">{formatStepType(currentStep.type)}</span>
								{currentStep.startedAtMs && (
									<LiveTimer startedAtMs={currentStep.startedAtMs} />
								)}
							</div>
							{currentStep.extra && Object.keys(currentStep.extra).length > 0 && (
								<div className="pktw-text-[#999999] pktw-mb-1 pktw-text-xs pktw-ml-5 pktw-space-y-0.5">
									{Object.entries(currentStep.extra).map(([key, value]) => (
										<div key={key} className="pktw-truncate">
											<span className="pktw-text-[#6b7280]">{key}:</span>{' '}
											{typeof value === 'object' ? JSON.stringify(value) : String(value)}
										</div>
									))}
								</div>
							)}
						</div>
						<div
							ref={currentStepContainerRef}
							className="pktw-leading-relaxed pktw-break-words pktw-text-sm pktw-text-[#2e3338] pktw-pt-2"
						/>
					</div>
				)}
			</div>
		</div>
	);
};

/**
 * Summary content component - displays the AI analysis summary with incremental rendering
 */
export const SummaryContent: React.FC<{
	summary: string;
	startedAtMs?: number | null;
	isRunning?: boolean;
	finalDurationMs?: number | null;
}> = ({ summary, startedAtMs, isRunning, finalDurationMs }) => {
	return (
		<div className="pktw-bg-[#f9fafb] pktw-rounded-lg pktw-p-4 pktw-border pktw-border-[#e5e7eb]">
			<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-3">
				<Sparkles className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed]" />
				<span className="pktw-text-sm pktw-font-semibold pktw-text-[#2e3338]">AI Analysis</span>
				<div className="pktw-flex-1" />
				{startedAtMs && isRunning === true && (
					<AnalysisTimer
						startedAtMs={startedAtMs}
						isRunning={isRunning}
						finalDurationMs={finalDurationMs ?? undefined}
					/>
				)}
			</div>
			<div className="pktw-space-y-3 pktw-text-sm pktw-text-[#2e3338] pktw-leading-relaxed">
				<div className="pktw-select-text pktw-break-words" data-streamdown-root>
					{summary ? (
						<Streamdown isAnimating={!!isRunning}>{summary}</Streamdown>
					) : (
						<span className="pktw-text-[#999999]">No summary available.</span>
					)}
				</div>
			</div>
		</div>
	);
};