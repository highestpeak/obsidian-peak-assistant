export interface LightboxKeyboardEvent {
	key: string;
	preventDefault(): void;
	stopPropagation(): void;
}

export interface LightboxKeyboardActions {
	hasMultiple: boolean;
	close(): void;
	previous(): void;
	next(): void;
	zoomIn(): void;
	zoomOut(): void;
	reset(): void;
}

function claimKeyboardEvent(event: LightboxKeyboardEvent, action: () => void): boolean {
	event.preventDefault();
	event.stopPropagation();
	action();
	return true;
}

export function handleLightboxKeyboardEvent(
	event: LightboxKeyboardEvent,
	actions: LightboxKeyboardActions,
): boolean {
	if (event.key === 'Escape') return claimKeyboardEvent(event, actions.close);
	if (event.key === 'ArrowLeft' && actions.hasMultiple) {
		return claimKeyboardEvent(event, actions.previous);
	}
	if (event.key === 'ArrowRight' && actions.hasMultiple) {
		return claimKeyboardEvent(event, actions.next);
	}
	if (event.key === '+' || event.key === '=') {
		return claimKeyboardEvent(event, actions.zoomIn);
	}
	if (event.key === '-') return claimKeyboardEvent(event, actions.zoomOut);
	if (event.key === '0') return claimKeyboardEvent(event, actions.reset);
	return false;
}
