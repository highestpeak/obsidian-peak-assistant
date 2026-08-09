export type PeakKeyboardSurfaceId =
	| 'vault-search'
	| 'ai-search'
	| 'file-atlas'
	| 'chat-studio'
	| 'composer';

export interface PeakKeyboardEscapeLayer {
	id: string;
	ownerDocument: Document;
	trigger: HTMLElement | null;
	contains?: (target: EventTarget | null) => boolean;
	close: () => void;
}

/** Surface-owned actions for destinations that are not currently mounted. */
export interface PeakKeyboardSurfaceAdapter {
	getKeyTipAnchor(actionId: string): HTMLElement | null;
}

export interface PeakKeyboardNavigationPort {
	registerSurface(
		surfaceId: PeakKeyboardSurfaceId,
		root: HTMLElement,
		adapter?: PeakKeyboardSurfaceAdapter,
	): () => void;
	requestSurfaceFocus(
		surfaceId: PeakKeyboardSurfaceId,
		zoneId?: string,
		ownerDocument?: Document,
	): void;
	focusSurface(
		surfaceId: PeakKeyboardSurfaceId,
		zoneId?: string,
		ownerDocument?: Document,
	): boolean;
	returnToLastPeakFocus(): boolean;
	registerEscapeLayer(layer: PeakKeyboardEscapeLayer): () => void;
	dispose(): void;
}
