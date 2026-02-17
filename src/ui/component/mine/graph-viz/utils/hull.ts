/**
 * Convex hull (Graham scan) for community hull drawing.
 */

export interface Point {
	x: number;
	y: number;
}

/** Returns convex hull points in counter-clockwise order. */
export function convexHull(points: Point[]): Point[] {
	if (points.length < 3) return [...points];
	const idx = points.map((p, i) => i);
	const start = idx.reduce((best, i) =>
		points[i].y < points[best].y || (points[i].y === points[best].y && points[i].x < points[best].x) ? i : best
	, 0);
	const startPt = points[start];
	const rest = idx.filter((i) => i !== start).sort((a, b) => {
		const ax = points[a].x - startPt.x;
		const ay = points[a].y - startPt.y;
		const bx = points[b].x - startPt.x;
		const by = points[b].y - startPt.y;
		const cross = ax * by - ay * bx;
		if (cross !== 0) return cross > 0 ? -1 : 1;
		return ax * ax + ay * ay - (bx * bx + by * by);
	});
	const stack: number[] = [start, rest[0]];
	for (let i = 1; i < rest.length; i++) {
		const curr = rest[i];
		while (stack.length >= 2) {
			const a = points[stack[stack.length - 2]];
			const b = points[stack[stack.length - 1]];
			const c = points[curr];
			const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
			if (cross <= 0) stack.pop();
			else break;
		}
		stack.push(curr);
	}
	return stack.map((i) => points[i]);
}
