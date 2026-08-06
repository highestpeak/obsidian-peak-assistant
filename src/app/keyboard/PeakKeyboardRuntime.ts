import {
	PEAK_KEYBOARD_SURFACE_LABELS,
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
	PeakKeyboardSurfaceId,
} from '@/ui/keyboard/KeyboardNavigationPort';

const ZONE_SELECTOR = '[data-peak-keyboard-zone]';
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
}

interface ActiveKeyTip {
	definition: PeakKeyTipDefinition;
	host: HTMLElement;
	badge: HTMLElement;
	madeRelative: boolean;
}

interface KeyTipSession {
	surface: RegisteredSurface;
	tips: ActiveKeyTip[];
}

interface DocumentState {
	surfaces: RegisteredSurface[];
	layers: PeakKeyboardEscapeLayer[];
	compositionActive: boolean;
	liveRegion: HTMLElement;
	modifierSurface: RegisteredSurface | null;
	keyTips: KeyTipSession | null;
	keydown: (event: KeyboardEvent) => void;
	keyup: (event: KeyboardEvent) => void;
	pointerdown: () => void;
	focusin: (event: FocusEvent) => void;
	blur: () => void;
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
	private pendingFocus: { surfaceId: PeakKeyboardSurfaceId; zoneId?: string } | null = null;
	private lastPeakFocus: HTMLElement | null = null;

	registerSurface(surfaceId: PeakKeyboardSurfaceId, root: HTMLElement): () => void {
		const state = this.ensureDocument(root.ownerDocument);
		const registration: RegisteredSurface = { id: surfaceId, root };
		state.surfaces.push(registration);
		root.dataset.peakKeyboardSurface = surfaceId;
		root.addEventListener('compositionstart', state.compositionstart, true);
		root.addEventListener('compositionend', state.compositionend, true);

		if (this.pendingFocus?.surfaceId === surfaceId) {
			const request = this.pendingFocus;
			this.pendingFocus = null;
			const ownerWindow = root.ownerDocument.defaultView;
			if (ownerWindow) {
				ownerWindow.setTimeout(() => {
					this.focusSurface(request.surfaceId, request.zoneId);
				}, 0);
			} else {
				this.focusSurface(request.surfaceId, request.zoneId);
			}
		}

		return () => {
			if (state.keyTips?.surface === registration) this.hideKeyTips(root.ownerDocument);
			root.removeEventListener('compositionstart', state.compositionstart, true);
			root.removeEventListener('compositionend', state.compositionend, true);
			delete root.dataset.peakKeyboardSurface;
			state.surfaces = state.surfaces.filter((candidate) => candidate !== registration);
			if (state.surfaces.length === 0 && state.layers.length === 0) {
				this.disposeDocument(root.ownerDocument);
			}
		};
	}

	requestSurfaceFocus(surfaceId: PeakKeyboardSurfaceId, zoneId?: string): void {
		if (this.focusSurface(surfaceId, zoneId)) return;
		this.pendingFocus = { surfaceId, zoneId };
	}

	focusSurface(surfaceId: PeakKeyboardSurfaceId, zoneId?: string): boolean {
		const registrations = Array.from(this.documents.values())
			.flatMap((state) => state.surfaces)
			.filter((surface) => surface.id === surfaceId && isVisible(surface.root));
		const surface = registrations[registrations.length - 1];
		if (!surface) return false;
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
			layers: [],
			compositionActive: false,
			liveRegion,
			modifierSurface: null,
			keyTips: null,
			keydown: (event) => this.onKeyDown(ownerDocument, event),
			keyup: (event) => this.onKeyUp(ownerDocument, event),
			pointerdown: () => {
				const current = this.documents.get(ownerDocument);
				if (current) current.modifierSurface = null;
				this.hideKeyTips(ownerDocument);
			},
			focusin: (event) => this.onFocusIn(ownerDocument, event),
			blur: () => {
				const current = this.documents.get(ownerDocument);
				if (current) current.modifierSurface = null;
				this.hideKeyTips(ownerDocument);
			},
			compositionstart: () => {
				const current = this.documents.get(ownerDocument);
				if (!current) return;
				current.compositionActive = true;
				current.modifierSurface = null;
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
		ownerDocument.defaultView?.addEventListener('blur', state.blur);
		this.documents.set(ownerDocument, state);
		return state;
	}

	private disposeDocument(ownerDocument: Document): void {
		const state = this.documents.get(ownerDocument);
		if (!state) return;
		this.hideKeyTips(ownerDocument);
		ownerDocument.removeEventListener('keydown', state.keydown, true);
		ownerDocument.removeEventListener('keyup', state.keyup, true);
		ownerDocument.removeEventListener('pointerdown', state.pointerdown, true);
		ownerDocument.removeEventListener('focusin', state.focusin, true);
		ownerDocument.defaultView?.removeEventListener('blur', state.blur);
		state.liveRegion.remove();
		this.documents.delete(ownerDocument);
	}

	private onKeyDown(ownerDocument: Document, event: KeyboardEvent): void {
		const state = this.documents.get(ownerDocument);
		if (!state || event.defaultPrevented) return;
		if (state.compositionActive || event.isComposing || event.key === 'Process') {
			state.modifierSurface = null;
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

		const context = this.resolveSurfaceForTarget(ownerDocument, event.target);
		if (isStandaloneKeyTipModifier(event)) {
			state.modifierSurface = context?.surface ?? null;
			return;
		}

		state.modifierSurface = null;
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
		const tip = session.tips.find((candidate) => candidate.definition.key === selectionKey);
		if (!tip) {
			state.liveRegion.textContent = `${PEAK_KEY_TIP_STRINGS.unknownPrefix} ${selectionKey}`;
			return;
		}
		this.hideKeyTips(ownerDocument);
		this.focusZone(session.surface, tip.host, tip.definition.label);
	}

	private onKeyUp(ownerDocument: Document, event: KeyboardEvent): void {
		const state = this.documents.get(ownerDocument);
		if (!state) return;
		const surface = state.modifierSurface;
		if (event.key === 'Alt') state.modifierSurface = null;
		if (!surface || !isStandaloneKeyTipModifier(event)) return;
		if (state.compositionActive || event.isComposing || event.key === 'Process') return;
		if (!isVisible(surface.root)) return;
		consume(event);
		if (state.keyTips?.surface === surface) {
			this.hideKeyTips(ownerDocument);
			return;
		}
		this.showKeyTips(surface);
	}

	private onFocusIn(ownerDocument: Document, event: FocusEvent): void {
		const context = this.resolveSurfaceForTarget(ownerDocument, event.target);
		const target = event.target as HTMLElement | null;
		if (!context || !target) return;
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
		const usedKeys = new Set<string>();
		const tips: ActiveKeyTip[] = [];
		for (const definition of PEAK_KEY_TIP_DEFINITIONS[surface.id]) {
			if (usedKeys.has(definition.key)) continue;
			const host = this.findKeyTipHost(surface, definition);
			if (!host) continue;
			const badge = ownerDocument.createElement('span');
			badge.className = 'pk-keytip';
			badge.dataset.peakKeytip = definition.key;
			badge.setAttribute('aria-hidden', 'true');
			const key = ownerDocument.createElement('kbd');
			key.textContent = definition.key;
			const label = ownerDocument.createElement('span');
			label.textContent = definition.label;
			badge.append(key, label);
			const madeRelative = ownerDocument.defaultView?.getComputedStyle(host).position === 'static';
			host.classList.add('pk-keytip-host');
			if (madeRelative) host.classList.add('pk-keytip-host--relative');
			host.appendChild(badge);
			tips.push({ definition, host, badge, madeRelative });
			usedKeys.add(definition.key);
		}
		if (tips.length === 0) return false;
		surface.root.classList.add('pk-keytips-active');
		surface.root.dataset.peakKeytips = 'visible';
		state.keyTips = { surface, tips };
		const keys = tips.map((tip) => tip.definition.key).join(', ');
		state.liveRegion.textContent = `${PEAK_KEYBOARD_SURFACE_LABELS[surface.id]} ${
			PEAK_KEY_TIP_STRINGS.shownSuffix
		}. ${PEAK_KEY_TIP_STRINGS.availablePrefix}: ${keys}`;
		return true;
	}

	private hideKeyTips(ownerDocument: Document): void {
		const state = this.documents.get(ownerDocument);
		const session = state?.keyTips;
		if (!state || !session) return;
		for (const tip of session.tips) tip.badge.remove();
		for (const tip of session.tips) {
			tip.host.classList.remove('pk-keytip-host');
			if (tip.madeRelative) tip.host.classList.remove('pk-keytip-host--relative');
		}
		session.surface.root.classList.remove('pk-keytips-active');
		delete session.surface.root.dataset.peakKeytips;
		state.keyTips = null;
	}

	private findKeyTipHost(
		surface: RegisteredSurface,
		definition: PeakKeyTipDefinition,
	): HTMLElement | null {
		return Array.from(surface.root.querySelectorAll<HTMLElement>(ZONE_SELECTOR)).find((zone) => {
			if (zone.closest('[data-peak-keyboard-surface]') !== surface.root) return false;
			if (zone.dataset.peakKeyboardZone !== definition.zoneId) return false;
			if (definition.zoneLabel && zone.dataset.peakKeyboardZoneLabel !== definition.zoneLabel) {
				return false;
			}
			return isVisible(zone);
		}) ?? null;
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
		const zoneId = zone?.dataset.peakKeyboardZone;
		if (zoneId) this.bookmarks.set(this.bookmarkKey(surface.id, zoneId), target);
		this.lastPeakFocus = target;
		return true;
	}

	private bookmarkKey(surfaceId: PeakKeyboardSurfaceId, zoneId: string): string {
		return `${surfaceId}:${zoneId}`;
	}
}
