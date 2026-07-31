export type PeakKeyboardSurfaceId =
	| 'vault-search'
	| 'ai-search'
	| 'file-atlas'
	| 'chat-studio';

export type PeakKeyboardMapCategory =
	| 'Navigation'
	| 'Action'
	| 'Editing'
	| 'Surface-specific';

export interface PeakKeyboardMapEntry {
	id: string;
	label: string;
	category: PeakKeyboardMapCategory;
	binding: string;
	commandId?: string;
	surfaceId?: PeakKeyboardSurfaceId;
	zoneId?: string;
	context: string;
	conflict?: string | null;
}

export interface PeakKeyboardMapContext {
	surfaceId: PeakKeyboardSurfaceId | null;
	zoneId: string | null;
	trigger: HTMLElement | null;
}

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
	focusNextZone(reverse?: boolean): boolean;
	returnToLastPeakFocus(): boolean;
	registerEscapeLayer(layer: PeakKeyboardEscapeLayer): () => void;
	getKeyboardMap(context?: Partial<PeakKeyboardMapContext>): PeakKeyboardMapEntry[];
	showKeyboardMap(context?: Partial<PeakKeyboardMapContext>): void;
	dispose(): void;
}
