import React, { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import { Activity, Sparkles, ChevronDown, ChevronRight } from 'lucide-react';
import { AIAnalysisStep } from '@/ui/view/quick-search/store/aiAnalysisStore';

export type StreamingDisplayMethods = {
	appendText: (text: string) => void;
	clear: () => void;
};

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
}> = ({
	steps,
	currentStep,
	stepTrigger,
	registerCurrentStepRender
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
			</div>

			<div
				ref={scrollContainerRef}
				className="pktw-h-64 pktw-overflow-y-auto pktw-space-y-3 pktw-scroll-smooth"
			>
				{/* Completed Steps */}
				{stepsWithFullText.map((step, index) => {
					const isExpanded = expandedSteps.has(index);
					return (
						<div key={`completed-${index}`} className="pktw-text-xs pktw-text-[#6c757d]">
							<div
								className="pktw-font-medium pktw-text-[#2e3338] pktw-mb-1 pktw-cursor-pointer pktw-flex pktw-items-center pktw-gap-2 pktw-hover:pktw-text-[#7c3aed] pktw-transition-colors"
								onClick={() => toggleStepExpansion(index)}
							>
								{isExpanded ? (
									<ChevronDown className="pktw-w-3 pktw-h-3" />
								) : (
									<ChevronRight className="pktw-w-3 pktw-h-3" />
								)}
								{formatStepType(step.type)}
							</div>
							{isExpanded && (
								<>
									<div className="pktw-leading-relaxed pktw-break-words pktw-ml-5">
										{step.fullText}
									</div>
									{step.extra && Object.keys(step.extra).length > 0 && (
										<div className="pktw-text-[#999999] pktw-mt-1 pktw-text-xs pktw-ml-5">
											{Object.entries(step.extra).map(([key, value]) => (
												<div key={key}>{key}: {String(value)}</div>
											))}
										</div>
									)}
								</>
							)}
						</div>
					);
				})}

				{/* Current Step */}
				{currentStep.type !== 'idle' && (
					<div className="pktw-text-xs pktw-text-[#6c757d]">
						{/* Fixed header for current step */}
						<div className="pktw-sticky pktw-top-0 pktw-bg-[#f9fafb] pktw-z-10 pktw-pb-2 pktw-border-b pktw-border-[#e5e7eb]">
							<div className="pktw-font-medium pktw-text-[#2e3338] pktw-mb-1">
								{formatStepType(currentStep.type)}
								<span className="pktw-ml-2 pktw-text-[#7c3aed] pktw-text-xs pktw-font-normal">
									(currently running)
								</span>
							</div>
							{currentStep.extra && Object.keys(currentStep.extra).length > 0 && (
								<div className="pktw-text-[#999999] pktw-mb-1 pktw-text-xs">
									{Object.entries(currentStep.extra).map(([key, value]) => (
										<div key={key}>{key}: {String(value)}</div>
									))}
								</div>
							)}
						</div>
						{/* Current step content */}
						<div
							ref={currentStepContainerRef}
							className="pktw-leading-relaxed pktw-break-words pktw-text-sm pktw-text-[#2e3338] pktw-pt-2"
						>
							{/* Current step content will be inserted here via incremental rendering */}
						</div>
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
	registerSummaryRender?: (methods: StreamingDisplayMethods) => void;
}> = ({ summary, registerSummaryRender }) => {
	const containerRef = useRef<HTMLDivElement>(null);

	// Use the shared incremental renderer hook
	const { appendText, clear } = useIncrementalRenderer(
		containerRef,
		undefined, // Use container itself for scrolling
		50 // 150ms delay for summary rendering
	);

	useEffect(() => {
		appendText(summary);
	}, [summary, appendText]);

	const methods = useMemo(() => ({
		appendText,
		clear
	}), [appendText, clear]);

	// Register methods with parent component
	useEffect(() => {
		if (registerSummaryRender) {
			registerSummaryRender(methods);
		}
	}, [registerSummaryRender, methods]);

	return (
		<div className="pktw-bg-[#f9fafb] pktw-rounded-lg pktw-p-4 pktw-border pktw-border-[#e5e7eb]">
			<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-3">
				<Sparkles className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed]" />
				<span className="pktw-text-sm pktw-font-semibold pktw-text-[#2e3338]">AI Analysis</span>
			</div>
			<div className="pktw-space-y-3 pktw-text-sm pktw-text-[#2e3338] pktw-leading-relaxed">
				<div
					ref={containerRef}
					className="pktw-select-text pktw-min-h-16 pktw-max-h-48 pktw-overflow-y-auto pktw-break-words pktw-scroll-smooth"
				>
					{/* Content will be inserted here via incremental rendering */}
				</div>
			</div>
		</div>
	);
};