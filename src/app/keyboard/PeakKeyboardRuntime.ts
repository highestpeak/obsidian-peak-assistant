import {
	KEYBOARD_MAP_DEFINITIONS,
	PEAK_KEYBOARD_SURFACE_LABELS,
} from '@/ui/keyboard/config/KeyboardNavigationDefaults';
import {
	isPeakEditorTarget,
	isUnmodifiedQuestionMark,
	shouldIgnoreApplicationKey,
} from '@/ui/keyboard/keyboardGuards';
import type {
	PeakKeyboardEscapeLayer,
	PeakKeyboardMapContext,
	PeakKeyboardMapEntry,
	PeakKeyboardNavigationPort,
	PeakKeyboardSurfaceId,
} from '@/ui/keyboard/KeyboardNavigationPort';

const ZONE_SELECTOR = '[data-peak-keyboard-zone]';
const FOCUSABLE_SELECTOR = [
	'[data-peak-keyboard-entry]',
	'[tabindex="0"]',
	'input:not([disabled])',
	'textarea:not([disabled])',
	'button:not([disabled])',
	'[role="button"]:not([aria-disabled="true"])',
	'[role="tab"]:not([aria-disabled="true"])',
	'[role="treeitem"]:not([aria-disabled="true"])',
	'[role="option"]:not([aria-disabled="true"])',
	'a[href]',
].join(',');

interface RegisteredSurface {
	id: PeakKeyboardSurfaceId;
	root: HTMLElement;
}

interface DocumentState {
	surfaces: RegisteredSurface[];
	layers: PeakKeyboardEscapeLayer[];
	compositionActive: boolean;
	liveRegion: HTMLElement;
	keydown: (event: KeyboardEvent) => void;
	focusin: (event: FocusEvent) => void;
	compositionstart: () => void;
	compositionend: () => void;
}

export interface PeakKeyboardRuntimeOptions {
	openKeyboardMap: (context: PeakKeyboardMapContext) => void;
	resolveCommandBinding?: (commandId: string) => {
		binding: string | null;
		conflict?: string | null;
	};
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

export class PeakKeyboardRuntime implements PeakKeyboardNavigationPort {
	private readonly documents = new Map<Document, DocumentState>();
	private readonly bookmarks = new Map<string, HTMLElement>();
	private pendingFocus: { surfaceId: PeakKeyboardSurfaceId; zoneId?: string } | null = null;
	private lastPeakFocus: HTMLElement | null = null;
	private activeContext: PeakKeyboardMapContext = {
		surfaceId: null,
		zoneId: null,
		trigger: null,
	};

	constructor(private readonly options: PeakKeyboardRuntimeOptions) {}

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
			root.removeEventListener('compositionstart', state.compositionstart, true);
			root.removeEventListener('compositionend', state.compositionend, true);
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

	focusNextZone(reverse = false): boolean {
		const context = this.resolveActiveSurface();
		if (!context) return false;
		const zones = this.visibleZones(context.surface);
		if (zones.length === 0) return false;
		const active = context.surface.root.ownerDocument.activeElement;
		const zone = currentZone(context.surface.root, active);
		const index = zone ? zones.indexOf(zone) : -1;
		const nextIndex = reverse
			? (index <= 0 ? zones.length - 1 : index - 1)
			: (index < 0 || index >= zones.length - 1 ? 0 : index + 1);
		return this.focusZone(context.surface, zones[nextIndex]);
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

	getKeyboardMap(context: Partial<PeakKeyboardMapContext> = {}): PeakKeyboardMapEntry[] {
		const surfaceId = context.surfaceId === undefined
			? this.activeContext.surfaceId
			: context.surfaceId;
		const zoneId = context.zoneId === undefined ? this.activeContext.zoneId : context.zoneId;
		return KEYBOARD_MAP_DEFINITIONS.map((definition) => {
			const command = definition.commandId
				? this.options.resolveCommandBinding?.(definition.commandId)
				: null;
			return {
				...definition,
				binding: command?.binding ?? definition.binding,
				conflict: command?.conflict ?? null,
			};
		}).filter((entry) => {
			if (surfaceId && entry.surfaceId && entry.surfaceId !== surfaceId) return false;
			if (entry.zoneId && zoneId && entry.zoneId !== zoneId) return false;
			return true;
		});
	}

	showKeyboardMap(context: Partial<PeakKeyboardMapContext> = {}): void {
		const merged: PeakKeyboardMapContext = {
			surfaceId: context.surfaceId === undefined
				? this.activeContext.surfaceId
				: context.surfaceId,
			zoneId: context.zoneId === undefined ? this.activeContext.zoneId : context.zoneId,
			trigger: context.trigger === undefined ? this.activeContext.trigger : context.trigger,
		};
		this.options.openKeyboardMap(merged);
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
			keydown: (event) => this.onKeyDown(ownerDocument, event),
			focusin: (event) => this.onFocusIn(ownerDocument, event),
			compositionstart: () => {
				const current = this.documents.get(ownerDocument);
				if (current) current.compositionActive = true;
			},
			compositionend: () => {
				const current = this.documents.get(ownerDocument);
				if (current) current.compositionActive = false;
			},
		};
		ownerDocument.addEventListener('keydown', state.keydown, true);
		ownerDocument.addEventListener('focusin', state.focusin, true);
		this.documents.set(ownerDocument, state);
		return state;
	}

	private disposeDocument(ownerDocument: Document): void {
		const state = this.documents.get(ownerDocument);
		if (!state) return;
		ownerDocument.removeEventListener('keydown', state.keydown, true);
		ownerDocument.removeEventListener('focusin', state.focusin, true);
		state.liveRegion.remove();
		this.documents.delete(ownerDocument);
	}

	private onKeyDown(ownerDocument: Document, event: KeyboardEvent): void {
		const state = this.documents.get(ownerDocument);
		if (!state || event.defaultPrevented) return;
		if (state.compositionActive || event.isComposing || event.key === 'Process') return;

		if (event.key === 'Escape') {
			const layer = [...state.layers].reverse().find((candidate) =>
				!candidate.contains || candidate.contains(event.target));
			if (!layer) return;
			event.preventDefault();
			event.stopPropagation();
			event.stopImmediatePropagation();
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

		if (shouldIgnoreApplicationKey(event, state.compositionActive)) return;
		const context = this.resolveSurfaceForTarget(ownerDocument, event.target);
		if (!context) return;

		if (event.key === 'F6' && !event.metaKey && !event.ctrlKey && !event.altKey) {
			event.preventDefault();
			event.stopPropagation();
			this.focusNextZone(event.shiftKey);
			return;
		}
		if (isUnmodifiedQuestionMark(event) && !isPeakEditorTarget(event.target)) {
			event.preventDefault();
			event.stopPropagation();
			const zone = currentZone(context.surface.root, event.target);
			this.showKeyboardMap({
				surfaceId: context.surface.id,
				zoneId: zone?.dataset.peakKeyboardZone ?? null,
				trigger: event.target as HTMLElement,
			});
		}
	}

	private onFocusIn(ownerDocument: Document, event: FocusEvent): void {
		const context = this.resolveSurfaceForTarget(ownerDocument, event.target);
		const target = event.target as HTMLElement | null;
		if (!context || !target) return;
		const zone = currentZone(context.surface.root, target);
		const zoneId = zone?.dataset.peakKeyboardZone ?? null;
		if (zoneId) this.bookmarks.set(this.bookmarkKey(context.surface.id, zoneId), target);
		this.lastPeakFocus = target;
		this.activeContext = {
			surfaceId: context.surface.id,
			zoneId,
			trigger: target,
		};
	}

	private resolveActiveSurface(): { state: DocumentState; surface: RegisteredSurface } | null {
		for (const [ownerDocument, state] of this.documents) {
			const active = ownerDocument.activeElement;
			const surface = [...state.surfaces].reverse().find((candidate) =>
				active && candidate.root.contains(active));
			if (surface) return { state, surface };
		}
		if (this.activeContext.surfaceId) {
			for (const state of this.documents.values()) {
				const surface = [...state.surfaces].reverse().find((candidate) =>
					candidate.id === this.activeContext.surfaceId && isVisible(candidate.root));
				if (surface) return { state, surface };
			}
		}
		return null;
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

	private focusZone(surface: RegisteredSurface, zone: HTMLElement): boolean {
		const zoneId = zone.dataset.peakKeyboardZone;
		const bookmarked = zoneId
			? this.bookmarks.get(this.bookmarkKey(surface.id, zoneId))
			: null;
		const target = bookmarked && zone.contains(bookmarked) && isVisible(bookmarked)
			? bookmarked
			: zone.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ?? zone;
		const focused = this.focusElement(target, surface, zone);
		if (!focused) return false;
		const state = this.documents.get(surface.root.ownerDocument);
		if (state) {
			const zoneLabel = zone.dataset.peakKeyboardZoneLabel ?? zoneId ?? 'Zone';
			state.liveRegion.textContent = `${PEAK_KEYBOARD_SURFACE_LABELS[surface.id]}, ${zoneLabel}`;
		}
		return true;
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
		this.activeContext = {
			surfaceId: surface.id,
			zoneId: zoneId ?? null,
			trigger: target,
		};
		return true;
	}

	private bookmarkKey(surfaceId: PeakKeyboardSurfaceId, zoneId: string): string {
		return `${surfaceId}:${zoneId}`;
	}
}
