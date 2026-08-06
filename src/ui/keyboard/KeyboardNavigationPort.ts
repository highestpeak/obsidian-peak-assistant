export type PeakKeyboardSurfaceId =
	| 'vault-search'
	| 'ai-search'
	| 'file-atlas'
	| 'chat-studio';

export interface PeakKeyboardEscapeLayer {
	id: string;
	ownerDocument: Document;
	trigger: HTMLElement | null;
	contains?: (target: EventTarget | null) => boolean;
	close: () => void;
}

export interface PeakKeyboardNavigationPort {
	registerSurface(surfaceId: PeakKeyboardSurfaceId, root: HTMLElement): () => void;
	requestSurfaceFocus(surfaceId: PeakKeyboardSurfaceId, zoneId?: string): void;
	focusSurface(surfaceId: PeakKeyboardSurfaceId, zoneId?: string): boolean;
	returnToLastPeakFocus(): boolean;
	registerEscapeLayer(layer: PeakKeyboardEscapeLayer): () => void;
	dispose(): void;
}
