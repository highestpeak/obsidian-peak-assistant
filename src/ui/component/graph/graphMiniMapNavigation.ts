export interface GraphMiniMapPoint {
	x: number;
	y: number;
}

export interface GraphMiniMapBounds {
	x1: number;
	y1: number;
	width: number;
	height: number;
}

export interface GraphMiniMapViewport {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface GraphModelExtent {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}

const MINI_MAP_SIZE = 100;
const MIN_VIEWPORT_SIZE = 5;

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.max(minimum, Math.min(maximum, value));
}

function normalize(value: number, origin: number, size: number): number {
	return ((value - origin) / Math.max(1, size)) * MINI_MAP_SIZE;
}

export function graphExtentToMiniMapViewport(
	bounds: GraphMiniMapBounds,
	extent: GraphModelExtent,
): GraphMiniMapViewport {
	const x1 = normalize(extent.x1, bounds.x1, bounds.width);
	const y1 = normalize(extent.y1, bounds.y1, bounds.height);
	const x2 = normalize(extent.x2, bounds.x1, bounds.width);
	const y2 = normalize(extent.y2, bounds.y1, bounds.height);
	const width = clamp(x2 - x1, MIN_VIEWPORT_SIZE, MINI_MAP_SIZE);
	const height = clamp(y2 - y1, MIN_VIEWPORT_SIZE, MINI_MAP_SIZE);
	const center = clampMiniMapCenter(
		{ x: (x1 + x2) / 2, y: (y1 + y2) / 2 },
		{ x: 0, y: 0, width, height },
	);
	return {
		x: center.x - width / 2,
		y: center.y - height / 2,
		width,
		height,
	};
}

export function clampMiniMapCenter(
	center: GraphMiniMapPoint,
	viewport: GraphMiniMapViewport,
): GraphMiniMapPoint {
	const halfWidth = clamp(viewport.width, 0, MINI_MAP_SIZE) / 2;
	const halfHeight = clamp(viewport.height, 0, MINI_MAP_SIZE) / 2;
	return {
		x: clamp(center.x, halfWidth, MINI_MAP_SIZE - halfWidth),
		y: clamp(center.y, halfHeight, MINI_MAP_SIZE - halfHeight),
	};
}

export function miniMapCenterToPan({
	bounds,
	center,
	zoom,
	viewport,
}: {
	bounds: GraphMiniMapBounds;
	center: GraphMiniMapPoint;
	zoom: number;
	viewport: { width: number; height: number };
}): GraphMiniMapPoint {
	const modelX = bounds.x1 + (center.x / MINI_MAP_SIZE) * bounds.width;
	const modelY = bounds.y1 + (center.y / MINI_MAP_SIZE) * bounds.height;
	return {
		x: viewport.width / 2 - modelX * zoom,
		y: viewport.height / 2 - modelY * zoom,
	};
}
