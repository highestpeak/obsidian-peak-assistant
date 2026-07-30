import * as React from 'react';

export type ComposerSurfaceKind =
	| 'draft'
	| 'selection'
	| 'link'
	| 'menu'
	| 'block-actions';

export interface ComposerSurfaceClaim {
	id: string;
	kind: ComposerSurfaceKind;
	ownerId: string;
}

export interface ComposerSurfaceCoordinator {
	active: ComposerSurfaceClaim | null;
	canClaim(kind: ComposerSurfaceKind, id: string): boolean;
	claim(next: ComposerSurfaceClaim): void;
	release(id: string): void;
}

const SURFACE_PRIORITY: Record<ComposerSurfaceKind, number> = {
	draft: 100,
	selection: 90,
	link: 80,
	menu: 70,
	'block-actions': 30,
};

export function composerSurfacePriority(kind: ComposerSurfaceKind): number {
	return SURFACE_PRIORITY[kind];
}

export function canReplaceComposerSurface(
	current: ComposerSurfaceClaim | null,
	next: ComposerSurfaceClaim,
): boolean {
	if (!current || current.id === next.id) return true;
	return composerSurfacePriority(next.kind) > composerSurfacePriority(current.kind);
}

const FALLBACK_COORDINATOR: ComposerSurfaceCoordinator = {
	active: null,
	canClaim: () => true,
	claim: () => undefined,
	release: () => undefined,
};

const ComposerSurfaceContext =
	React.createContext<ComposerSurfaceCoordinator>(FALLBACK_COORDINATOR);

export function useComposerSurfaceCoordinatorState(): ComposerSurfaceCoordinator {
	const [active, setActive] = React.useState<ComposerSurfaceClaim | null>(null);
	const activeRef = React.useRef(active);
	activeRef.current = active;

	const canClaim = React.useCallback((kind: ComposerSurfaceKind, id: string): boolean => {
		return canReplaceComposerSurface(activeRef.current, { id, kind, ownerId: '' });
	}, []);
	const claim = React.useCallback((next: ComposerSurfaceClaim): void => {
		setActive((current) => {
			if (
				current?.id === next.id &&
				current.kind === next.kind &&
				current.ownerId === next.ownerId
			) return current;
			return canReplaceComposerSurface(current, next) ? next : current;
		});
	}, []);
	const release = React.useCallback((id: string): void => {
		setActive((current) => current?.id === id ? null : current);
	}, []);

	return React.useMemo(
		() => ({ active, canClaim, claim, release }),
		[active, canClaim, claim, release],
	);
}

export function ComposerSurfaceProvider({
	value,
	children,
}: {
	value: ComposerSurfaceCoordinator;
	children: React.ReactNode;
}): React.ReactElement {
	return (
		<ComposerSurfaceContext.Provider value={value}>
			{children}
		</ComposerSurfaceContext.Provider>
	);
}

export function useComposerSurfaces(): ComposerSurfaceCoordinator {
	return React.useContext(ComposerSurfaceContext);
}
