import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ProjectListViewComponent } from '@/ui/view/project-list-view/ProjectListView';
import { ConversationIndex } from '@/ui/view/chat-view/components/ConversationIndex';
import { ChatViewComponent } from '@/ui/view/chat-view/ChatViewComponent';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import { useChatViewStore } from '@/ui/view/chat-view/store/chatViewStore';
import { PanelLeftOpen, PanelLeftClose } from 'lucide-react';
import { IconButton } from '@/ui/components/primitives';
import { ChatStudioStringsProvider, useChatStudioStrings } from '@/ui/view/chat-view/chatStudioStringsContext';
import {
	LEFT_LIMITS,
	RIGHT_LIMITS,
	STUDIO_NARROW_BREAKPOINT_PX,
	StudioLayoutPreference,
	clampWidth,
	decideResponsiveCollapse,
} from './chatStudioLeftLogic';
import { readLayoutPreference, writeLayoutPreference } from './chatStudioLayoutStorage';
import {
	usePeakEscapeLayer,
	usePeakKeyboardSurface,
} from '@/ui/keyboard/usePeakKeyboardSurface';
import {
	PEAK_CONTROL_KEY_TIP_KEYS,
	PEAK_KEYBOARD_ZONE_LABELS,
} from '@/ui/keyboard/config/KeyboardNavigationDefaults';

/** Central column minimum width (mock `minmax(440px, 1fr)`). */
const STUDIO_CENTRE_MIN_WIDTH_PX = 440;

/**
 * ChatStudioPanel — single-leaf three-column chat workspace (Chat Studio §5).
 *
 * Left:   ProjectListViewComponent — New chat / Search / Pinned / Projects / Recent.
 * Middle: ChatViewComponent — full router (Messages / AllProjects /
 *         ProjectOverview / etc). Entry lands on the new-chat start state.
 * Right:  ConversationIndex — Outline / Resources; visible ONLY when there is
 *         an active conversation (SHELL-04). On the new-chat start state /
 *         project-overview the right column is unmounted, so no splitter is
 *         focusable and no space is wasted.
 *
 * All three columns share `chatViewStore` + `chatDataStore` (Zustand
 * singletons), so navigation and selection stay coherent across columns
 * without any prop drilling.
 */
const ChatStudioPanelInner: React.FC = () => {
	const rootRef = useRef<HTMLDivElement | null>(null);
	const leftDrawerRef = useRef<HTMLDivElement | null>(null);
	const leftDrawerTriggerRef = useRef<HTMLDivElement | null>(null);
	usePeakKeyboardSurface('chat-studio', rootRef);
	const activeConversation = useChatDataStore((s) => s.activeConversation);
	const rightColumnVisible = activeConversation !== null;
	// Shell chrome strings (drawer toggles + splitter aria-labels) come from the
	// runtime-loaded chat-studio config, never hard-coded literals.
	const shell = useChatStudioStrings().shell;

	// Persisted UI preference (widths + user-collapsed flags).
	const [pref, setPref] = useState<StudioLayoutPreference>(() => readLayoutPreference());
	const prefRef = useRef(pref);
	useEffect(() => {
		prefRef.current = pref;
	}, [pref]);

	// Responsive collapse decision recomputed from a ResizeObserver on the
	// shell root. Below the narrow breakpoint we auto-fold right first, then
	// left. This is layout state — never touches selection.
	//
	// useLayoutEffect (not useEffect) so the first synchronous measurement
	// lands BEFORE the browser paints — otherwise the initial 0-width frame
	// would flash the narrow (drawer) layout. The effect re-runs whenever the
	// subtree remounts (ReactRenderer's doc-keyed remount after a popout
	// adoption), re-binding the ResizeObserver to the correct window.
	const [containerWidth, setContainerWidth] = useState(0);
	useLayoutEffect(() => {
		const el = rootRef.current;
		if (!el) return;
		const doc = el.ownerDocument;
		const win = doc.defaultView ?? window;
		const measure = () => setContainerWidth(el.getBoundingClientRect().width);
		// Synchronous first measurement — no 0-width first paint.
		measure();
		const RO = (win as Window & typeof globalThis).ResizeObserver;
		const obs = RO ? new RO(() => measure()) : null;
		obs?.observe(el);
		// Window-resize fallback covers the case where the ResizeObserver is
		// bound to a stale window (defence-in-depth against the popout-adoption
		// timing bug — see ReactItemViewHost.onResize).
		win.addEventListener('resize', measure);
		return () => {
			obs?.disconnect();
			win.removeEventListener('resize', measure);
		};
	}, []);

	// No `|| Infinity` fail-open: a stuck 0 width must surface as the narrow
	// layout, not be disguised as "infinitely wide". The synchronous measure
	// above guarantees a real width before first paint.
	const responsive = useMemo(
		() => decideResponsiveCollapse(containerWidth, pref),
		[containerWidth, pref]
	);

	// Effective layout state — user pref layered onto responsive decision.
	// Right column is force-hidden when there is no active conversation.
	const leftDrawerOnly = responsive.leftForcedDrawer;
	const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
	const leftVisible = leftDrawerOnly ? leftDrawerOpen : !pref.leftCollapsed;
	const rightMounted = rightColumnVisible && !responsive.rightCollapsed;
	usePeakEscapeLayer(
		leftDrawerOnly && leftDrawerOpen,
		leftDrawerRef,
		'chat-studio-left-drawer',
		() => setLeftDrawerOpen(false),
		leftDrawerTriggerRef.current?.querySelector('button') ?? null,
		true,
	);
	useEffect(() => {
		if (!leftDrawerOnly || !leftDrawerOpen) return;
		const drawer = leftDrawerRef.current;
		const win = drawer?.ownerDocument.defaultView;
		win?.requestAnimationFrame(() => {
			const target = drawer?.querySelector<HTMLElement>(
				'[data-peak-focus-id], button:not([disabled]), [tabindex="0"]',
			);
			(target ?? drawer)?.focus({ preventScroll: true });
		});
	}, [leftDrawerOnly, leftDrawerOpen]);

	const persist = useCallback((next: Partial<StudioLayoutPreference>) => {
		setPref((prev) => {
			const merged: StudioLayoutPreference = {
				leftWidth: clampWidth(next.leftWidth ?? prev.leftWidth, LEFT_LIMITS),
				rightWidth: clampWidth(next.rightWidth ?? prev.rightWidth, RIGHT_LIMITS),
				leftCollapsed: next.leftCollapsed ?? prev.leftCollapsed,
				rightCollapsed: next.rightCollapsed ?? prev.rightCollapsed,
			};
			writeLayoutPreference(merged, rootRef.current?.ownerDocument ?? null);
			return merged;
		});
	}, []);

	const onLeftResize = useCallback((dx: number) => {
		persist({ leftWidth: prefRef.current.leftWidth + dx });
	}, [persist]);
	const onRightResize = useCallback((dx: number) => {
		persist({ rightWidth: prefRef.current.rightWidth - dx });
	}, [persist]);

	const onLeftReset = useCallback(() => {
		persist({ leftWidth: LEFT_LIMITS.default });
	}, [persist]);
	const onRightReset = useCallback(() => {
		persist({ rightWidth: RIGHT_LIMITS.default });
	}, [persist]);
	const onRightCollapse = useCallback(() => {
		persist({ rightCollapsed: true });
		const root = rootRef.current;
		const win = root?.ownerDocument.defaultView;
		win?.requestAnimationFrame(() => {
			win.requestAnimationFrame(() => {
				root?.querySelector<HTMLElement>('[data-peak-chat-restore-right]')?.focus({
					preventScroll: true,
				});
			});
		});
	}, [persist]);

	// S5 — expose a "restore right column" callback to the middle-column
	// Header (which lives in ChatViewComponent and can't reach `persist`
	// directly). Publish it only when the right column was collapsed by the
	// USER (not by the responsive breakpoint) and there is room to restore it;
	// otherwise clear it so Header hides the button. The Header renders a
	// PanelRight IconButton exactly when this callback is non-null.
	const setStudioRestoreRight = useChatViewStore((s) => s.setStudioRestoreRight);
	const rightManuallyCollapsed =
		rightColumnVisible && pref.rightCollapsed && containerWidth >= STUDIO_NARROW_BREAKPOINT_PX;
	useEffect(() => {
		if (!rightManuallyCollapsed) {
			setStudioRestoreRight(null);
			return;
		}
		setStudioRestoreRight(() => persist({ rightCollapsed: false }));
		return () => setStudioRestoreRight(null);
	}, [rightManuallyCollapsed, persist, setStudioRestoreRight]);

	return (
		<div
			ref={rootRef}
			className="pktw-flex pktw-h-full pktw-w-full pktw-overflow-hidden pktw-relative"
		>
				{leftDrawerOnly && (
					<div
						ref={leftDrawerTriggerRef}
						className={`pktw-absolute pktw-top-2 pktw-left-2 pktw-z-10${
							leftDrawerOpen ? ' pktw-hidden' : ''
						}`}
					>
					<IconButton
						label={shell.openLeftDrawerLabel}
						title={shell.openLeftDrawerLabel}
						data-peak-keytip-key={PEAK_CONTROL_KEY_TIP_KEYS.chatStudio.openLeft}
						data-peak-keytip-label={shell.openLeftDrawerLabel}
						onClick={() => setLeftDrawerOpen(true)}
					>
						<PanelLeftOpen aria-hidden style={{ width: 14, height: 14 }} />
					</IconButton>
				</div>
			)}
			{leftVisible && (
				<>
					<div
						ref={leftDrawerRef}
						className="pkchat-studio__left pktw-h-full pktw-overflow-auto pktw-relative"
						style={{ width: pref.leftWidth, flexShrink: 0 }}
						data-peak-keyboard-zone="cs-left-navigation"
						data-peak-keyboard-zone-label={PEAK_KEYBOARD_ZONE_LABELS['cs-left-navigation']}
						data-peak-keyboard-order="1"
					>
						{leftDrawerOnly && (
							<div className="pktw-absolute pktw-top-2 pktw-right-2 pktw-z-10">
								<IconButton
									label={shell.closeLeftDrawerLabel}
									title={shell.closeLeftDrawerLabel}
									data-peak-keytip-key={PEAK_CONTROL_KEY_TIP_KEYS.chatStudio.closeLeft}
									data-peak-keytip-label={shell.closeLeftDrawerLabel}
									onClick={() => setLeftDrawerOpen(false)}
								>
									<PanelLeftClose aria-hidden style={{ width: 14, height: 14 }} />
								</IconButton>
							</div>
						)}
						<ProjectListViewComponent />
					</div>
					{!leftDrawerOnly && (
						<StudioResizerHandle
							ariaLabel={shell.resizeLeftLabel}
							valueNow={pref.leftWidth}
							valueMin={LEFT_LIMITS.min}
							valueMax={LEFT_LIMITS.max}
							onResize={onLeftResize}
							onReset={onLeftReset}
						/>
					)}
				</>
			)}
			<div
				className="pktw-flex-1 pktw-min-w-0 pktw-h-full pktw-overflow-hidden"
				style={{
					// N3 — floor the centre at 440px so dragging both side columns
					// to their max can't squish it (mock `minmax(440px, 1fr)`).
					// Only above the narrow breakpoint; below it the right column is
					// collapsed and the middle must stay free to shrink (min-w-0),
					// preserving the pre-existing responsive behaviour.
					minWidth:
						containerWidth >= STUDIO_NARROW_BREAKPOINT_PX
							? STUDIO_CENTRE_MIN_WIDTH_PX
							: undefined,
				}}
			>
				<ChatViewComponent />
			</div>
			{rightMounted && (
				<>
					<StudioResizerHandle
						ariaLabel={shell.resizeRightLabel}
						valueNow={pref.rightWidth}
						valueMin={RIGHT_LIMITS.min}
						valueMax={RIGHT_LIMITS.max}
						onResize={onRightResize}
						onReset={onRightReset}
					/>
					<div
						className="pkchat-studio__right pktw-h-full pktw-overflow-auto"
						style={{ width: pref.rightWidth, flexShrink: 0 }}
						data-peak-keyboard-zone="cs-conversation-index"
						data-peak-keyboard-zone-label={PEAK_KEYBOARD_ZONE_LABELS['cs-conversation-index']}
						data-peak-keyboard-order="4"
					>
						<ConversationIndex onCollapse={onRightCollapse} />
					</div>
				</>
			)}
		</div>
	);
};

/**
 * Public entry — wraps the panel in `ChatStudioStringsProvider` so the shell
 * chrome (drawer toggles + splitter aria-labels) reads runtime-loaded config
 * strings. The left/middle/right columns mount their own providers; this one
 * only covers the shell itself, mirroring view-Messages / ConversationIndex.
 */
export const ChatStudioPanel: React.FC = () => (
	<ChatStudioStringsProvider>
		<ChatStudioPanelInner />
	</ChatStudioStringsProvider>
);

interface StudioResizerHandleProps {
	ariaLabel: string;
	onResize: (dx: number) => void;
	onReset: () => void;
	step?: number;
	valueNow?: number;
	valueMin?: number;
	valueMax?: number;
}

/**
 * Splitter with mouse drag (owner-document aware for detached windows),
 * keyboard nudge (ArrowLeft / ArrowRight, 4px step by default), and
 * double-click reset (SHELL-03). Home / End jump to min / max width.
 * ARIA valuemin/valuemax/valuenow published so screen readers can announce
 * the current column width.
 */
const StudioResizerHandle: React.FC<StudioResizerHandleProps> = ({
	ariaLabel,
	onResize,
	onReset,
	step = 4,
	valueNow,
	valueMin,
	valueMax,
}) => {
	const lastXRef = useRef<number | null>(null);
	const [dragging, setDragging] = useState(false);
	const onResizeRef = useRef(onResize);
	useEffect(() => {
		onResizeRef.current = onResize;
	}, [onResize]);

	useEffect(() => {
		return () => {
			// If we unmount mid-drag, null the tracking ref so any lingering
			// document-level handleMove becomes a no-op until the user releases
			// the mouse (at which point handleUp self-removes both listeners).
			lastXRef.current = null;
		};
	}, []);

	const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
		e.preventDefault();
		lastXRef.current = e.clientX;
		setDragging(true);
		// CRITICAL: detached Obsidian windows have their own `document`.
		// Listening on the global `document` would miss mouse events when
		// the user drags inside the Studio window. Always listen on the
		// handle's ownerDocument so the drag works in both regular tabs
		// and detached windows.
		const ownerDoc = e.currentTarget.ownerDocument;
		const handleMove = (ev: MouseEvent) => {
			if (lastXRef.current === null) return;
			const dx = ev.clientX - lastXRef.current;
			lastXRef.current = ev.clientX;
			onResizeRef.current(dx);
		};
		const handleUp = () => {
			lastXRef.current = null;
			setDragging(false);
			ownerDoc.removeEventListener('mousemove', handleMove);
			ownerDoc.removeEventListener('mouseup', handleUp);
		};
		ownerDoc.addEventListener('mousemove', handleMove);
		ownerDoc.addEventListener('mouseup', handleUp);
	}, []);

	const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
		const keyboardStep = e.shiftKey ? step * 4 : step;
		if (e.key === 'ArrowLeft') {
			e.preventDefault();
			onResizeRef.current(-keyboardStep);
		} else if (e.key === 'ArrowRight') {
			e.preventDefault();
			onResizeRef.current(keyboardStep);
		} else if (e.key === 'Home' && valueMin !== undefined && valueNow !== undefined) {
			e.preventDefault();
			onResizeRef.current(valueMin - valueNow);
		} else if (e.key === 'End' && valueMax !== undefined && valueNow !== undefined) {
			e.preventDefault();
			onResizeRef.current(valueMax - valueNow);
		} else if (e.key === 'Enter' || e.key === ' ') {
			// Double-click equivalent from keyboard: reset to default.
			e.preventDefault();
			onReset();
		}
	}, [step, valueMin, valueMax, valueNow, onReset]);

	return (
		<div
			role="separator"
			tabIndex={0}
			aria-orientation="vertical"
			aria-label={ariaLabel}
			aria-valuemin={valueMin}
			aria-valuemax={valueMax}
			aria-valuenow={valueNow !== undefined ? Math.round(valueNow) : undefined}
			className="pkchat-studio__splitter"
			data-dragging={dragging ? 'true' : undefined}
			onMouseDown={handleMouseDown}
			onDoubleClick={onReset}
			onKeyDown={handleKeyDown}
		/>
	);
};
