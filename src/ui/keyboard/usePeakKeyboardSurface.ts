import { useEffect, type RefObject } from 'react';
import { useServiceContext } from '@/ui/context/ServiceContext';
import type {
	PeakKeyboardEscapeLayer,
	PeakKeyboardSurfaceId,
} from './KeyboardNavigationPort';

export function usePeakKeyboardSurface(
	surfaceId: PeakKeyboardSurfaceId,
	rootRef: RefObject<HTMLElement | null>,
): void {
	const { keyboardNavigation } = useServiceContext();

	useEffect(() => {
		const root = rootRef.current;
		if (!root || !keyboardNavigation) return;
		return keyboardNavigation.registerSurface(surfaceId, root);
	}, [keyboardNavigation, rootRef, surfaceId]);
}

export function usePeakEscapeLayer(
	open: boolean,
	rootRef: RefObject<HTMLElement | null>,
	id: string,
	onClose: () => void,
	trigger?: HTMLElement | null,
	documentWide = false,
): void {
	const { keyboardNavigation } = useServiceContext();

	useEffect(() => {
		const root = rootRef.current;
		if (!open || !root || !keyboardNavigation) return;
		const layer: PeakKeyboardEscapeLayer = {
			id,
			ownerDocument: root.ownerDocument,
			trigger: trigger ?? root.ownerDocument.activeElement as HTMLElement | null,
			contains: documentWide
				? undefined
				: (target) => {
					const NodeCtor = root.ownerDocument.defaultView?.Node;
					if (!NodeCtor || !(target instanceof NodeCtor)) return false;
					return root.contains(target) || Boolean(trigger?.contains(target));
				},
			close: onClose,
		};
		return keyboardNavigation.registerEscapeLayer(layer);
	}, [documentWide, id, keyboardNavigation, onClose, open, rootRef, trigger]);
}
