import React, { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import { Activity, ChevronDown, ChevronRight, Check } from 'lucide-react';
import { type UIStepRecord } from '@/ui/view/quick-search/store/aiAnalysisStore';
import { motion } from 'framer-motion';
import { AnalysisTimer } from '@/ui/component/mine/IntelligenceFrame';
import { useSubscribeUIEvent, useUIEventStore } from '@/ui/store/uiEventStore';
import { useStepDisplayReplayStore } from '@/ui/view/quick-search/store/stepDisplayReplayStore';
import { UIStepType } from '@/core/providers/types';
import { SearchPipelineVisualizer } from './SearchPipelineVisualizer';

export type StreamingDisplayMethods = {
	appendText: (text: string) => void;
	clear: () => void;
};

/**
 * Live timer that updates using RAF(requestAnimationFrame) for smooth display
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
	/** Omit when streaming; steps are driven by ui-step events. Pass when showing completed analysis from store. */
	steps?: UIStepRecord[];
	/** Omit when streaming; current step comes from ui-step events. */
	currentStep?: UIStepRecord | null;
	/** Omit when streaming. */
	stepTrigger?: number;
	registerCurrentStepRender?: (methods: StreamingDisplayMethods) => void;
	startedAtMs?: number | null;
	isRunning?: boolean;
	finalDurationMs?: number | null;
}> = ({ steps = [], currentStep = null, stepTrigger = 0, startedAtMs, isRunning, finalDurationMs }) => {
	const showVisualizer = Boolean(startedAtMs || isRunning);
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const currentStepContainerRef = useRef<HTMLDivElement>(null);
	const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

	// Event-driven step state (ui-step / ui-step-delta)
	type EventStep = { title: string; description: string; startedAtMs?: number };
	/** Unified shape for a completed step (from event or store). */
	type CompletedStepDisplay = EventStep | {
		title: string;
		description: string;
		fullText: string;
		startedAtMs?: number;
		endedAtMs?: number;
		rawType?: string;
		extra?: Record<string, unknown>;
	};
	const [eventStepIds, setEventStepIds] = useState<string[]>([]);
	const [eventStepsById, setEventStepsById] = useState<Record<string, EventStep>>({});
	const [eventCurrentStepId, setEventCurrentStepId] = useState<string | null>(null);
	const eventCurrentStepIdRef = useRef<string | null>(null);
	eventCurrentStepIdRef.current = eventCurrentStepId;
	const titleJustChangedRef = useRef(false);
	// Accumulate deltas per stepId so parallel steps and late-arriving deltas are not lost.
	type DeltaAccum = { stepId: string; titleChunks: string[]; descChunks: string[]; startedAtMs: number };
	const deltaAccumRef = useRef<DeltaAccum | null>(null);
	const stepAccumsRef = useRef<Record<string, DeltaAccum>>({});

	// Use the shared incremental renderer hook
	const { appendText, clear, resetUserScroll } = useIncrementalRenderer(
		currentStepContainerRef,
		scrollContainerRef,
		50
	);

	// Reset event state when analysis starts (new run)
	useEffect(() => {
		if (startedAtMs && isRunning) {
			setEventStepIds([]);
			setEventStepsById({});
			setEventCurrentStepId(null);
			deltaAccumRef.current = null;
			stepAccumsRef.current = {};
		}
	}, [startedAtMs, isRunning]);

	// Flush one step's accum to eventStepsById (used when switching step or on complete).
	const flushStepAccum = useCallback((acc: DeltaAccum | null) => {
		if (!acc) return;
		const title = acc.titleChunks.join('') || 'Step';
		const description = acc.descChunks.join('');
		setEventStepsById((by) => ({
			...by,
			[acc.stepId]: { title, description, startedAtMs: acc.startedAtMs },
		}));
	}, []);

	// Subscribe to ui-step and ui-step-delta (steps-display only)
	const handleUIEvent = useCallback((type: string, payload: any) => {
		if (payload?.uiType !== UIStepType.STEPS_DISPLAY) return;
		const stepId = payload?.stepId;
		if (!stepId) return;

		if (type === 'ui-step') {
			const prev = eventCurrentStepIdRef.current;
			if (prev && prev !== stepId) {
				flushStepAccum(deltaAccumRef.current);
				deltaAccumRef.current = null;
				setTimeout(() => clear(), 0);
			}
			const newDesc = typeof payload.description === 'string' ? payload.description : '';
			const titleChanged = typeof payload.title === 'string';
			if (titleChanged) titleJustChangedRef.current = true;
			const ts = Date.now();
			const newTitle = typeof payload.title === 'string' ? payload.title : 'Step';
			const acc: DeltaAccum = { stepId, titleChunks: newTitle ? [newTitle] : [], descChunks: newDesc ? [newDesc] : [], startedAtMs: ts };
			stepAccumsRef.current[stepId] = acc;
			deltaAccumRef.current = acc;
			setEventStepIds((ids) => (ids.includes(stepId) ? ids : [...ids, stepId]));
			setEventStepsById((by) => ({
				...by,
				[stepId]: { title: newTitle, description: newDesc, startedAtMs: by[stepId]?.startedAtMs ?? ts },
			}));
			setEventCurrentStepId(stepId);
			if (newDesc) {
				const prefix = titleJustChangedRef.current ? '\n' : '';
				if (prefix) titleJustChangedRef.current = false;
				appendText(prefix + newDesc);
			}
		} else if (type === 'ui-step-delta') {
			const deltaDesc = typeof payload.descriptionDelta === 'string' ? payload.descriptionDelta : '';
			const deltaTitle = typeof payload.titleDelta === 'string' ? payload.titleDelta : '';
			if (deltaTitle) titleJustChangedRef.current = true;
			let acc = stepAccumsRef.current[stepId];
			if (!acc) {
				acc = { stepId, titleChunks: [], descChunks: [], startedAtMs: Date.now() };
				stepAccumsRef.current[stepId] = acc;
			}
			if (deltaDesc) acc.descChunks.push(deltaDesc);
			if (deltaTitle) acc.titleChunks.push(deltaTitle);
			// Live append only for the current step so user sees text-delta/reasoning-delta stream.
			if (deltaDesc && eventCurrentStepIdRef.current === stepId) {
				const prefix = titleJustChangedRef.current ? '\n' : '';
				if (prefix) titleJustChangedRef.current = false;
				appendText(prefix + deltaDesc);
			}
		}
	}, [clear, appendText, flushStepAccum]);

	useSubscribeUIEvent(new Set(['ui-step', 'ui-step-delta']), handleUIEvent);

	const streamStarted = useStepDisplayReplayStore((s) => s.streamStarted);
	// Replay last ui-step on load when we mounted after it was published (read from UI event store)
	useEffect(() => {
		if (!streamStarted) return;
		const last = useUIEventStore.getState().lastEvent;
		if (last?.type !== 'ui-step' || last.payload?.uiType !== UIStepType.STEPS_DISPLAY) return;
		const stepId = last.payload?.stepId;
		if (!stepId || eventStepIds.includes(stepId)) return;
		handleUIEvent('ui-step', last.payload);
	}, [streamStarted, eventStepIds, handleUIEvent]);

	// On complete, flush all step accums (including late-arriving deltas for parallel steps) to eventStepsById.
	const handleComplete = useCallback(() => {
		for (const acc of Object.values(stepAccumsRef.current)) {
			flushStepAccum(acc);
		}
		stepAccumsRef.current = {};
		deltaAccumRef.current = null;
		setEventCurrentStepId(null);
	}, [flushStepAccum]);
	useSubscribeUIEvent(new Set(['complete']), handleComplete);

	// Reset current step container when step changes (store path only; event path clears in handler).
	// Defer clear so completed list is updated first and old step stays visible.
	const eventStepCountRef = useRef(0);
	eventStepCountRef.current = eventStepIds.length;
	useEffect(() => {
		if (eventStepCountRef.current > 0) return;
		const id = setTimeout(() => {
			clear();
			resetUserScroll();
		}, 0);
		return () => clearTimeout(id);
	}, [stepTrigger, clear, resetUserScroll]);

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

	/** Unified completed steps: from event when available, else from store. Consecutive steps with same title are deduped. */
	const completedStepsForDisplay = useMemo((): CompletedStepDisplay[] => {
		let list: CompletedStepDisplay[];
		if (eventStepIds.length > 0) {
			const idx = eventCurrentStepId ? eventStepIds.indexOf(eventCurrentStepId) : -1;
			const completedIds = idx >= 0 ? eventStepIds.slice(0, idx) : eventStepIds;
			list = completedIds.map((id) => eventStepsById[id]).filter(Boolean) as EventStep[];
		} else {
			list = (steps ?? []).map((step) => ({
				title: step.title,
				description: step.description,
				fullText: step.description,
				startedAtMs: step.startedAtMs,
				endedAtMs: step.endedAtMs,
				rawType: step.title,
			}));
		}
		return list.filter((step, i) => i === 0 || (step.title || '') !== (list[i - 1]?.title ?? ''));
	}, [eventStepIds, eventCurrentStepId, eventStepsById, steps]);

	/** Current step for display: event when available, else store. */
	const currentStepForDisplay = useMemo(() => {
		if (eventStepIds.length > 0 && eventCurrentStepId && eventStepsById[eventCurrentStepId]) {
			const e = eventStepsById[eventCurrentStepId];
			return { type: 'event' as const, title: e.title, description: e.description, startedAtMs: e.startedAtMs };
		}
		if (currentStep) {
			return {
				type: 'store' as const,
				title: currentStep.title,
				rawType: currentStep.title,
				startedAtMs: currentStep.startedAtMs,
				extra: undefined,
			};
		}
		return null;
	}, [eventStepIds.length, eventCurrentStepId, eventStepsById, currentStep]);

	return (
		<div className="pktw-bg-[#f9fafb] pktw-rounded-lg pktw-border pktw-border-[#e5e7eb] pktw-max-h-[420px] pktw-flex pktw-flex-col pktw-overflow-hidden">
			<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-3 pktw-px-4 pktw-pt-3 pktw-shrink-0">
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
				className="pktw-flex-1 pktw-min-h-0 pktw-overflow-y-auto pktw-overflow-x-visible pktw-scroll-smooth pktw-px-4 pktw-pb-4"
			>
				{/* Completed steps: unified list from event or store */}
				{completedStepsForDisplay.map((step, index) => {
					const title = step.title || 'Step';
					const body = step.description?.trim() ?? ('fullText' in step ? step.fullText : '') ?? '';
					const hasExtra = 'extra' in step && step.extra && Object.keys(step.extra).length > 0;
					const isExpanded = expandedSteps.has(index);
					const stepTitle = 'rawType' in step && step.rawType ? step.rawType : title;
					const showDuration = 'endedAtMs' in step && step.startedAtMs != null && step.endedAtMs != null;
					return (
						<div
							key={`completed-${index}`}
							className="pktw-text-xs pktw-text-[#6c757d] pktw-mb-3 pktw-pl-1"
						>
							<div
								className="pktw-font-medium pktw-text-[#2e3338] pktw-mb-1 pktw-cursor-pointer pktw-flex pktw-items-center pktw-gap-2 hover:pktw-text-[#7c3aed] pktw-transition-colors"
								onClick={() => toggleStepExpansion(index)}
								title={stepTitle}
							>
								<CompletedIndicator />
								{isExpanded ? (
									<ChevronDown className="pktw-w-3 pktw-h-3" />
								) : (
									<ChevronRight className="pktw-w-3 pktw-h-3" />
								)}
								<span className="pktw-flex-1">{title}</span>
								{showDuration && 'startedAtMs' in step && 'endedAtMs' in step && (
									<CompletedDuration startedAtMs={step.startedAtMs!} endedAtMs={step.endedAtMs!} />
								)}
							</div>
							<div
								className="pktw-overflow-hidden pktw-transition-[max-height,opacity] pktw-duration-200"
								style={{
									maxHeight: isExpanded ? 480 : 0,
									opacity: isExpanded ? 1 : 0,
								}}
							>
								<div className="pktw-leading-relaxed pktw-break-words pktw-ml-8 pktw-mt-1">
									{body}
								</div>
								{hasExtra && 'extra' in step && step.extra && (
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

				{/* Current step: unified from event or store */}
				{currentStepForDisplay && (
					<div className="pktw-text-xs pktw-text-[#6c757d]">
						<div
							className="pktw-sticky pktw-top-0 pktw-bg-[#f9fafb] pktw-z-10 pktw-pb-2 pktw-border-b pktw-border-[#e5e7eb] pktw-pl-1"
							title={currentStepForDisplay.type === 'store' ? currentStepForDisplay.rawType : currentStepForDisplay.title}
						>
							<div className="pktw-font-medium pktw-text-[#2e3338] pktw-mb-1 pktw-flex pktw-items-center pktw-gap-2">
								<RunningIndicator />
								<span className="pktw-flex-1">{currentStepForDisplay.title || 'Step'}</span>
								{currentStepForDisplay.startedAtMs != null && (
									<LiveTimer startedAtMs={currentStepForDisplay.startedAtMs} />
								)}
							</div>
							{currentStepForDisplay.type === 'store' && currentStepForDisplay.extra && Object.keys(currentStepForDisplay.extra).length > 0 && (
								<div className="pktw-text-[#999999] pktw-mb-1 pktw-text-xs pktw-ml-5 pktw-space-y-0.5">
									{Object.entries(currentStepForDisplay.extra).map(([key, value]) => (
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
			{showVisualizer && (
				<div className="pktw-shrink-0 pktw-border-t pktw-border-[#e5e7eb] pktw-px-4 pktw-py-3">
					<SearchPipelineVisualizer isStreaming={isRunning} />
				</div>
			)}
		</div>
	);
};