import {
	PEAK_KEYBOARD_SURFACE_LABELS,
	PEAK_KEY_TIP_ACTIVATION,
	PEAK_KEY_TIP_DEFINITIONS,
	PEAK_KEY_TIP_STRINGS,
	type PeakKeyTipDefinition,
} from '@/ui/keyboard/config/KeyboardNavigationDefaults';
import {
	isStandaloneKeyTipModifier,
	keyTipSelectionKey,
} from '@/ui/keyboard/keyboardGuards';
import type {
	PeakKeyboardEscapeLayer,
	PeakKeyboardNavigationPort,
	PeakKeyboardSurfaceAdapter,
	PeakKeyboardSurfaceId,
} from '@/ui/keyboard/KeyboardNavigationPort';

const ZONE_SELECTOR = '[data-peak-keyboard-zone]';
const CONTROL_KEY_TIP_SELECTOR = '[data-peak-keytip-key]';
const FOCUSABLE_SELECTORS = [
	'[data-peak-keyboard-entry]',
	'[data-peak-focus-id][tabindex="0"]',
	'[role="textbox"]',
	'.cm-content[tabindex]',
	'input:not([disabled])',
	'textarea:not([disabled])',
	'[tabindex="0"]',
	'[role="treeitem"]:not([aria-disabled="true"])',
	'[role="option"]:not([aria-disabled="true"])',
	'[role="tab"]:not([aria-disabled="true"])',
	'button:not([disabled])',
	'[role="button"]:not([aria-disabled="true"])',
	'a[href]',
] as const;

interface RegisteredSurface {
	id: PeakKeyboardSurfaceId;
	root: HTMLElement;
	adapter?: PeakKeyboardSurfaceAdapter;
}

interface ActiveKeyTip {
	key: string;
	label: string;
	anchor: HTMLElement;
	zone: HTMLElement | null;
	badge: HTMLElement;
}

interface PositionedRect {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

interface KeyTipSession {
	surface: RegisteredSurface;
	tips: ActiveKeyTip[];
	layer: HTMLElement;
	observer: MutationObserver | null;
	refreshFrame: number | null;
}

interface DocumentState {
	surfaces: RegisteredSurface[];
	activeSurface: RegisteredSurface | null;
	layers: PeakKeyboardEscapeLayer[];
	compositionActive: boolean;
	liveRegion: HTMLElement;
	modifierSurface: RegisteredSurface | null;
	modifierTimer: number | null;
	modifierShownWhileHeld: boolean;
	modifierDismissed: boolean;
	keyTips: KeyTipSession | null;
	keydown: (event: KeyboardEvent) => void;
	keyup: (event: KeyboardEvent) => void;
	pointerdown: () => void;
	focusin: (event: FocusEvent) => void;
	blur: () => void;
	reposition: () => void;
	compositionstart: () => void;
	compositionend: () => void;
}

function isVisible(element: HTMLElement): boolean {
	if (!element.isConnected || element.hidden || element.getAttribute('aria-hidden') === 'true') {
		return false;
	}
	const win = element.ownerDocument.defaultView;
	if (!win) return true;
	const style = win.getComputedStyle(element);
	if (style.display === 'none' || style.visibility === 'hidden') return false;
	return element.getClientRects().length > 0 || style.position === 'fixed';
}

function currentZone(root: HTMLElement, target: EventTarget | null): HTMLElement | null {
	const NodeCtor = root.ownerDocument.defaultView?.Node;
	if (!NodeCtor || !(target instanceof NodeCtor)) return null;
	const zone = (target as HTMLElement).closest?.(ZONE_SELECTOR) as HTMLElement | null;
	return zone && root.contains(zone) ? zone : null;
}

function consume(event: KeyboardEvent): void {
	event.preventDefault();
	event.stopPropagation();
	event.stopImmediatePropagation();
}

export class PeakKeyboardRuntime implements PeakKeyboardNavigationPort {
	private readonly documents = new Map<Document, DocumentState>();
	private readonly bookmarks = new Map<string, HTMLElement>();
	private pendingFocus: {
		surfaceId: PeakKeyboardSurfaceId;
		zoneId?: string;
		ownerDocument?: Document;
	} | null = null;
	private lastPeakFocus: HTMLElement | null = null;

	registerSurface(
		surfaceId: PeakKeyboardSurfaceId,
		root: HTMLElement,
		adapter?: PeakKeyboardSurfaceAdapter,
	): () => void {
		const state = this.ensureDocument(root.ownerDocument);
		const registration: RegisteredSurface = { id: surfaceId, root, adapter };
		state.surfaces.push(registration);
		state.activeSurface = registration;
		root.dataset.peakKeyboardSurface = surfaceId;
		root.addEventListener('compositionstart', state.compositionstart, true);
		root.addEventListener('compositionend', state.compositionend, true);

		if (
			this.pendingFocus?.surfaceId === surfaceId
			&& (!this.pendingFocus.ownerDocument || this.pendingFocus.ownerDocument === root.ownerDocument)
		) {
			const request = this.pendingFocus;
			this.pendingFocus = null;
			const ownerWindow = root.ownerDocument.defaultView;
			if (ownerWindow) {
				ownerWindow.setTimeout(() => {
					this.focusSurface(request.surfaceId, request.zoneId, request.ownerDocument);
				}, 0);
			} else {
				this.focusSurface(request.surfaceId, request.zoneId, request.ownerDocument);
			}
		}

		return () => {
			if (state.keyTips?.surface === registration) this.hideKeyTips(root.ownerDocument);
			root.removeEventListener('compositionstart', state.compositionstart, true);
			root.removeEventListener('compositionend', state.compositionend, true);
			delete root.dataset.peakKeyboardSurface;
			state.surfaces = state.surfaces.filter((candidate) => candidate !== registration);
			if (state.activeSurface === registration) {
				state.activeSurface = [...state.surfaces].reverse().find((candidate) =>
					isVisible(candidate.root)) ?? null;
			}
			if (state.modifierSurface === registration) this.cancelModifierGesture(state);
			if (state.surfaces.length === 0 && state.layers.length === 0) {
				this.disposeDocument(root.ownerDocument);
			}
		};
	}

	requestSurfaceFocus(
		surfaceId: PeakKeyboardSurfaceId,
		zoneId?: string,
		ownerDocument?: Document,
	): void {
		if (this.focusSurface(surfaceId, zoneId, ownerDocument)) return;
		this.pendingFocus = { surfaceId, zoneId, ownerDocument };
	}

	focusSurface(
		surfaceId: PeakKeyboardSurfaceId,
		zoneId?: string,
		ownerDocument?: Document,
	): boolean {
		const documentStates = ownerDocument
			? [this.documents.get(ownerDocument)].filter((state): state is DocumentState => Boolean(state))
			: Array.from(this.documents.values());
		const registrations = documentStates
			.flatMap((state) => state.surfaces)
			.filter((surface) => surface.id === surfaceId && isVisible(surface.root));
		const surface = registrations[registrations.length - 1];
		if (!surface) return false;
		const state = this.documents.get(surface.root.ownerDocument);
		if (state) state.activeSurface = surface;
		const zones = this.visibleZones(surface);
		const zone = zoneId
			? zones.find((candidate) => candidate.dataset.peakKeyboardZone === zoneId)
			: zones[0];
		if (!zone) return this.focusElement(surface.root, surface, null);
		return this.focusZone(surface, zone);
	}

	returnToLastPeakFocus(): boolean {
		const target = this.lastPeakFocus;
		if (!target || !isVisible(target)) return false;
		target.focus({ preventScroll: true });
		target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
		return true;
	}

	registerEscapeLayer(layer: PeakKeyboardEscapeLayer): () => void {
		const state = this.ensureDocument(layer.ownerDocument);
		state.layers.push(layer);
		return () => {
			state.layers = state.layers.filter((candidate) => candidate !== layer);
			if (state.surfaces.length === 0 && state.layers.length === 0) {
				this.disposeDocument(layer.ownerDocument);
			}
		};
	}

	dispose(): void {
		for (const ownerDocument of [...this.documents.keys()]) {
			this.disposeDocument(ownerDocument);
		}
		this.bookmarks.clear();
		this.pendingFocus = null;
		this.lastPeakFocus = null;
	}

	private ensureDocument(ownerDocument: Document): DocumentState {
		const existing = this.documents.get(ownerDocument);
		if (existing) return existing;
		const liveRegion = ownerDocument.createElement('div');
		liveRegion.className = 'pk-keyboard-live-region';
		liveRegion.setAttribute('aria-live', 'polite');
		liveRegion.setAttribute('aria-atomic', 'true');
		ownerDocument.body.appendChild(liveRegion);
		const state: DocumentState = {
			surfaces: [],
			activeSurface: null,
			layers: [],
			compositionActive: false,
			liveRegion,
			modifierSurface: null,
			modifierTimer: null,
			modifierShownWhileHeld: false,
			modifierDismissed: false,
			keyTips: null,
			keydown: (event) => this.onKeyDown(ownerDocument, event),
			keyup: (event) => this.onKeyUp(ownerDocument, event),
			pointerdown: () => {
				const current = this.documents.get(ownerDocument);
				if (current) this.cancelModifierGesture(current);
				this.hideKeyTips(ownerDocument);
			},
			focusin: (event) => this.onFocusIn(ownerDocument, event),
			blur: () => {
				const current = this.documents.get(ownerDocument);
				if (current) this.cancelModifierGesture(current);
				this.hideKeyTips(ownerDocument);
			},
			reposition: () => this.positionKeyTips(ownerDocument),
			compositionstart: () => {
				const current = this.documents.get(ownerDocument);
				if (!current) return;
				current.compositionActive = true;
				this.cancelModifierGesture(current);
				this.hideKeyTips(ownerDocument);
			},
			compositionend: () => {
				const current = this.documents.get(ownerDocument);
				if (current) current.compositionActive = false;
			},
		};
		ownerDocument.addEventListener('keydown', state.keydown, true);
		ownerDocument.addEventListener('keyup', state.keyup, true);
		ownerDocument.addEventListener('pointerdown', state.pointerdown, true);
		ownerDocument.addEventListener('focusin', state.focusin, true);
		ownerDocument.addEventListener('scroll', state.reposition, true);
		ownerDocument.defaultView?.addEventListener('blur', state.blur);
		ownerDocument.defaultView?.addEventListener('resize', state.reposition);
		this.documents.set(ownerDocument, state);
		return state;
	}

	private disposeDocument(ownerDocument: Document): void {
		const state = this.documents.get(ownerDocument);
		if (!state) return;
		this.cancelModifierGesture(state);
		this.hideKeyTips(ownerDocument);
		ownerDocument.removeEventListener('keydown', state.keydown, true);
		ownerDocument.removeEventListener('keyup', state.keyup, true);
		ownerDocument.removeEventListener('pointerdown', state.pointerdown, true);
		ownerDocument.removeEventListener('focusin', state.focusin, true);
		ownerDocument.removeEventListener('scroll', state.reposition, true);
		ownerDocument.defaultView?.removeEventListener('blur', state.blur);
		ownerDocument.defaultView?.removeEventListener('resize', state.reposition);
		state.liveRegion.remove();
		this.documents.delete(ownerDocument);
	}

	private onKeyDown(ownerDocument: Document, event: KeyboardEvent): void {
		const state = this.documents.get(ownerDocument);
		if (!state || event.defaultPrevented) return;
		if (state.compositionActive || event.isComposing || event.key === 'Process') {
			this.cancelModifierGesture(state);
			this.hideKeyTips(ownerDocument);
			return;
		}

		if (event.key === 'Escape' && state.keyTips) {
			consume(event);
			this.hideKeyTips(ownerDocument);
			return;
		}

		if (event.key === 'Escape') {
			const layer = [...state.layers].reverse().find((candidate) =>
				!candidate.contains || candidate.contains(event.target));
			if (!layer) return;
			consume(event);
			layer.close();
			const restoreFocus = (): void => {
				const trigger = layer.trigger;
				if (trigger && isVisible(trigger)) trigger.focus({ preventScroll: true });
			};
			const ownerWindow = ownerDocument.defaultView;
			if (ownerWindow) ownerWindow.setTimeout(restoreFocus, 0);
			else restoreFocus();
			return;
		}

		if (isStandaloneKeyTipModifier(event)) {
			if (state.keyTips) {
				consume(event);
				this.cancelModifierTimer(state);
				state.modifierSurface = null;
				state.modifierShownWhileHeld = false;
				state.modifierDismissed = true;
				this.hideKeyTips(ownerDocument);
				return;
			}
			const surface = this.resolveActiveSurface(ownerDocument, event.target);
			state.modifierSurface = surface;
			state.modifierShownWhileHeld = false;
			state.modifierDismissed = false;
			this.cancelModifierTimer(state);
			const ownerWindow = ownerDocument.defaultView;
			if (!surface || !ownerWindow) return;
			state.modifierTimer = ownerWindow.setTimeout(() => {
				const current = this.documents.get(ownerDocument);
				if (!current || current.modifierSurface !== surface) return;
				current.modifierTimer = null;
				if (current.compositionActive || !isVisible(surface.root)) return;
				current.modifierShownWhileHeld = this.showKeyTips(surface);
			}, PEAK_KEY_TIP_ACTIVATION.holdDelayMs);
			return;
		}

		if (state.modifierSurface || state.modifierTimer !== null) {
			const shownWhileHeld = state.modifierShownWhileHeld;
			this.cancelModifierGesture(state);
			if (shownWhileHeld) this.hideKeyTips(ownerDocument);
			return;
		}

		if (!state.keyTips) return;
		if (event.altKey || event.ctrlKey || event.metaKey) {
			this.hideKeyTips(ownerDocument);
			return;
		}

		const selectionKey = keyTipSelectionKey(event);
		if (!selectionKey) {
			if (!['Shift', 'Control', 'Meta'].includes(event.key)) {
				this.hideKeyTips(ownerDocument);
			}
			return;
		}

		consume(event);
		const session = state.keyTips;
		const tip = session.tips.find((candidate) => candidate.key === selectionKey);
		if (!tip) {
			state.liveRegion.textContent = `${PEAK_KEY_TIP_STRINGS.unknownPrefix} ${selectionKey}`;
			return;
		}
		this.hideKeyTips(ownerDocument);
		if (!this.focusElement(tip.anchor, session.surface, tip.zone)) return;
		state.liveRegion.textContent = `${PEAK_KEYBOARD_SURFACE_LABELS[session.surface.id]}, ${tip.label}`;
	}

	private onKeyUp(ownerDocument: Document, event: KeyboardEvent): void {
		const state = this.documents.get(ownerDocument);
		if (!state || event.key !== 'Alt') return;
		const surface = state.modifierSurface;
		const shownWhileHeld = state.modifierShownWhileHeld;
		const dismissed = state.modifierDismissed;
		this.cancelModifierGesture(state);
		if (dismissed) {
			consume(event);
			return;
		}
		if (!surface || !isStandaloneKeyTipModifier(event)) return;
		if (state.compositionActive || event.isComposing) return;
		if (!isVisible(surface.root)) return;
		consume(event);
		if (shownWhileHeld) return;
		this.showKeyTips(surface);
	}

	private onFocusIn(ownerDocument: Document, event: FocusEvent): void {
		const context = this.resolveSurfaceForTarget(ownerDocument, event.target);
		const target = event.target as HTMLElement | null;
		if (!context || !target) return;
		context.state.activeSurface = context.surface;
		const zone = currentZone(context.surface.root, target);
		const zoneId = zone?.dataset.peakKeyboardZone ?? null;
		if (zoneId) this.bookmarks.set(this.bookmarkKey(context.surface.id, zoneId), target);
		this.lastPeakFocus = target;
	}

	private showKeyTips(surface: RegisteredSurface): boolean {
		const ownerDocument = surface.root.ownerDocument;
		const state = this.documents.get(ownerDocument);
		if (!state) return false;
		this.hideKeyTips(ownerDocument);
		const layer = ownerDocument.createElement('div');
		layer.className = 'pk-keytip-layer';
		layer.setAttribute('aria-hidden', 'true');
		ownerDocument.body.appendChild(layer);
		const session: KeyTipSession = {
			surface,
			tips: [],
			layer,
			observer: null,
			refreshFrame: null,
		};
		state.keyTips = session;
		this.refreshKeyTips(ownerDocument);
		if (!state.keyTips || state.keyTips.tips.length === 0) return false;
		surface.root.classList.add('pk-keytips-active');
		surface.root.dataset.peakKeytips = 'visible';
		const ObserverCtor = ownerDocument.defaultView?.MutationObserver;
		if (ObserverCtor) {
			session.observer = new ObserverCtor(() => this.scheduleKeyTipRefresh(ownerDocument));
			session.observer.observe(surface.root, {
				attributes: true,
				childList: true,
				subtree: true,
			});
		}
		state.activeSurface = surface;
		const keys = session.tips.map((tip) => tip.key).join(', ');
		state.liveRegion.textContent = `${PEAK_KEYBOARD_SURFACE_LABELS[surface.id]} ${
			PEAK_KEY_TIP_STRINGS.shownSuffix
		}. ${PEAK_KEY_TIP_STRINGS.availablePrefix}: ${keys}`;
		return true;
	}

	private refreshKeyTips(ownerDocument: Document): void {
		const session = this.documents.get(ownerDocument)?.keyTips;
		if (!session) return;
		for (const tip of session.tips) tip.badge.remove();
		session.tips = [];
		const usedKeys = new Set<string>();
		for (const anchor of session.surface.root.querySelectorAll<HTMLElement>(
			CONTROL_KEY_TIP_SELECTOR,
		)) {
			if (anchor.closest('[data-peak-keyboard-surface]') !== session.surface.root) continue;
			if (!isVisible(anchor) || anchor.hasAttribute('disabled')) continue;
			if (anchor.getAttribute('aria-disabled') === 'true') continue;
			const key = anchor.dataset.peakKeytipKey?.trim().toLocaleUpperCase() ?? '';
			if (!/^[A-Z]$/.test(key) || usedKeys.has(key)) continue;
			this.appendKeyTip(session, usedKeys, {
				key,
				label: this.controlLabel(anchor, key),
				anchor,
				zone: currentZone(session.surface.root, anchor),
			});
		}
		for (const definition of PEAK_KEY_TIP_DEFINITIONS[session.surface.id]) {
			if (usedKeys.has(definition.key)) continue;
			const anchor = this.findKeyTipAnchor(session.surface, definition);
			if (!anchor) continue;
			this.appendKeyTip(session, usedKeys, {
				key: definition.key,
				label: definition.label,
				anchor,
				zone: currentZone(session.surface.root, anchor),
			});
		}
		if (session.tips.length === 0) {
			this.hideKeyTips(ownerDocument);
			return;
		}
		this.positionKeyTips(ownerDocument);
	}

	private appendKeyTip(
		session: KeyTipSession,
		usedKeys: Set<string>,
		tip: Omit<ActiveKeyTip, 'badge'>,
	): void {
		const badge = session.surface.root.ownerDocument.createElement('span');
		badge.className = 'pk-keytip';
		badge.dataset.peakKeytip = tip.key;
		badge.setAttribute('aria-hidden', 'true');
		const keycap = session.surface.root.ownerDocument.createElement('kbd');
		keycap.textContent = tip.key;
		badge.append(keycap);
		session.layer.appendChild(badge);
		session.tips.push({ ...tip, badge });
		usedKeys.add(tip.key);
	}

	private controlLabel(control: HTMLElement, fallback: string): string {
		return control.dataset.peakKeytipLabel?.trim()
			|| control.getAttribute('aria-label')?.trim()
			|| control.getAttribute('title')?.trim()
			|| control.textContent?.trim()
			|| fallback;
	}

	private hideKeyTips(ownerDocument: Document): void {
		const state = this.documents.get(ownerDocument);
		const session = state?.keyTips;
		if (!state || !session) return;
		session.observer?.disconnect();
		const ownerWindow = ownerDocument.defaultView;
		if (session.refreshFrame !== null && ownerWindow) {
			ownerWindow.cancelAnimationFrame(session.refreshFrame);
		}
		session.layer.remove();
		session.surface.root.classList.remove('pk-keytips-active');
		delete session.surface.root.dataset.peakKeytips;
		state.keyTips = null;
	}

	private scheduleKeyTipRefresh(ownerDocument: Document): void {
		const session = this.documents.get(ownerDocument)?.keyTips;
		const ownerWindow = ownerDocument.defaultView;
		if (!session || !ownerWindow || session.refreshFrame !== null) return;
		session.refreshFrame = ownerWindow.requestAnimationFrame(() => {
			const current = this.documents.get(ownerDocument)?.keyTips;
			if (!current) return;
			current.refreshFrame = null;
			this.refreshKeyTips(ownerDocument);
		});
	}

	private positionKeyTips(ownerDocument: Document): void {
		const session = this.documents.get(ownerDocument)?.keyTips;
		const ownerWindow = ownerDocument.defaultView;
		if (!session || !ownerWindow) return;
		const occupied: PositionedRect[] = [];
		for (const tip of session.tips) {
			const anchorRect = tip.anchor.getBoundingClientRect();
			const outsideViewport = anchorRect.bottom <= 0
				|| anchorRect.right <= 0
				|| anchorRect.top >= ownerWindow.innerHeight
				|| anchorRect.left >= ownerWindow.innerWidth;
			tip.badge.hidden = outsideViewport;
			if (outsideViewport) continue;
			const badgeRect = tip.badge.getBoundingClientRect();
			const maxLeft = Math.max(8, ownerWindow.innerWidth - badgeRect.width - 8);
			const maxTop = Math.max(8, ownerWindow.innerHeight - badgeRect.height - 8);
			const left = Math.min(Math.max(8, anchorRect.left + 8), maxLeft);
			const initialTop = Math.min(Math.max(8, anchorRect.top + 8), maxTop);
			const verticalStep = badgeRect.height + 6;
			let top = initialTop;
			let positioned = this.positionedRect(left, top, badgeRect.width, badgeRect.height);
			for (let attempt = 1; occupied.some((rect) => this.rectsOverlap(rect, positioned)); attempt += 1) {
				const below = initialTop + attempt * verticalStep;
				top = below <= maxTop
					? below
					: Math.max(8, initialTop - attempt * verticalStep);
				positioned = this.positionedRect(left, top, badgeRect.width, badgeRect.height);
				if (attempt >= session.tips.length) break;
			}
			tip.badge.style.left = `${Math.round(positioned.left)}px`;
			tip.badge.style.top = `${Math.round(positioned.top)}px`;
			occupied.push(positioned);
		}
	}

	private positionedRect(
		left: number,
		top: number,
		width: number,
		height: number,
	): PositionedRect {
		return { left, top, right: left + width, bottom: top + height };
	}

	private rectsOverlap(left: PositionedRect, right: PositionedRect): boolean {
		return left.left < right.right
			&& left.right > right.left
			&& left.top < right.bottom
			&& left.bottom > right.top;
	}

	private findKeyTipAnchor(
		surface: RegisteredSurface,
		definition: PeakKeyTipDefinition,
	): HTMLElement | null {
		if (definition.actionId) {
			const anchor = surface.adapter?.getKeyTipAnchor(definition.actionId) ?? null;
			return anchor && isVisible(anchor) ? anchor : null;
		}
		const zone = Array.from(surface.root.querySelectorAll<HTMLElement>(ZONE_SELECTOR)).find((candidate) => {
			if (candidate.closest('[data-peak-keyboard-surface]') !== surface.root) return false;
			if (candidate.dataset.peakKeyboardZone !== definition.zoneId) return false;
			if (definition.zoneLabel && candidate.dataset.peakKeyboardZoneLabel !== definition.zoneLabel) {
				return false;
			}
			return isVisible(candidate);
		}) ?? null;
		return zone ? this.findFocusable(zone) ?? zone : null;
	}

	private resolveActiveSurface(
		ownerDocument: Document,
		target: EventTarget | null,
	): RegisteredSurface | null {
		const state = this.documents.get(ownerDocument);
		if (!state) return null;
		// Registration and focusin both update activeSurface. Prefer that app-owned
		// foreground marker over the key event target: a command can mount a new
		// Surface while Electron still dispatches Alt from the old trigger.
		if (state.activeSurface && isVisible(state.activeSurface.root)) return state.activeSurface;
		const direct = this.resolveSurfaceForTarget(ownerDocument, target)?.surface;
		if (direct && isVisible(direct.root)) return direct;
		const focused = this.resolveSurfaceForTarget(ownerDocument, ownerDocument.activeElement)?.surface;
		if (focused && isVisible(focused.root)) return focused;
		return [...state.surfaces].reverse().find((surface) => isVisible(surface.root)) ?? null;
	}

	private resolveSurfaceForTarget(
		ownerDocument: Document,
		target: EventTarget | null,
	): { state: DocumentState; surface: RegisteredSurface } | null {
		const state = this.documents.get(ownerDocument);
		const NodeCtor = ownerDocument.defaultView?.Node;
		if (!state || !NodeCtor || !(target instanceof NodeCtor)) return null;
		const surface = [...state.surfaces].reverse().find((candidate) =>
			candidate.root.contains(target as Node));
		return surface ? { state, surface } : null;
	}

	private visibleZones(surface: RegisteredSurface): HTMLElement[] {
		return Array.from(surface.root.querySelectorAll<HTMLElement>(ZONE_SELECTOR))
			.filter((zone) => zone.closest('[data-peak-keyboard-surface]') === surface.root)
			.filter(isVisible)
			.sort((left, right) => {
				const leftOrder = Number(left.dataset.peakKeyboardOrder ?? Number.MAX_SAFE_INTEGER);
				const rightOrder = Number(right.dataset.peakKeyboardOrder ?? Number.MAX_SAFE_INTEGER);
				return leftOrder - rightOrder;
			});
	}

	private focusZone(
		surface: RegisteredSurface,
		zone: HTMLElement,
		announcement?: string,
	): boolean {
		const zoneId = zone.dataset.peakKeyboardZone;
		const bookmarked = zoneId
			? this.bookmarks.get(this.bookmarkKey(surface.id, zoneId))
			: null;
		const target = bookmarked && zone.contains(bookmarked) && isVisible(bookmarked)
			? bookmarked
			: this.findFocusable(zone) ?? zone;
		const focused = this.focusElement(target, surface, zone);
		if (!focused) return false;
		const state = this.documents.get(surface.root.ownerDocument);
		if (state) {
			const label = announcement
				?? zone.dataset.peakKeyboardZoneLabel
				?? PEAK_KEYBOARD_SURFACE_LABELS[surface.id];
			state.liveRegion.textContent = `${PEAK_KEYBOARD_SURFACE_LABELS[surface.id]}, ${label}`;
		}
		return true;
	}

	private findFocusable(zone: HTMLElement): HTMLElement | null {
		for (const selector of FOCUSABLE_SELECTORS) {
			const target = Array.from(zone.querySelectorAll<HTMLElement>(selector)).find(isVisible);
			if (target) return target;
		}
		return null;
	}

	private focusElement(
		target: HTMLElement,
		surface: RegisteredSurface,
		zone: HTMLElement | null,
	): boolean {
		if (!target.hasAttribute('tabindex') && target === zone) target.tabIndex = -1;
		target.focus({ preventScroll: true });
		target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
		if (surface.root.ownerDocument.activeElement !== target) return false;
		const state = this.documents.get(surface.root.ownerDocument);
		if (state) state.activeSurface = surface;
		const zoneId = zone?.dataset.peakKeyboardZone;
		if (zoneId) this.bookmarks.set(this.bookmarkKey(surface.id, zoneId), target);
		this.lastPeakFocus = target;
		return true;
	}

	private cancelModifierTimer(state: DocumentState): void {
		if (state.modifierTimer === null) return;
		state.liveRegion.ownerDocument.defaultView?.clearTimeout(state.modifierTimer);
		state.modifierTimer = null;
	}

	private cancelModifierGesture(state: DocumentState): void {
		this.cancelModifierTimer(state);
		state.modifierSurface = null;
		state.modifierShownWhileHeld = false;
		state.modifierDismissed = false;
	}

	private bookmarkKey(surfaceId: PeakKeyboardSurfaceId, zoneId: string): string {
		return `${surfaceId}:${zoneId}`;
	}
}
