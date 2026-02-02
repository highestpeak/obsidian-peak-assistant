import React, { useEffect } from 'react';
import type { GraphVisualEffect } from '@/ui/component/mine/graph-viz/graphAnimationStore';
import type { GraphVizLink, GraphVizNode } from '../types';
import { getLinkEndpointId } from '../utils/link-key';

export interface GraphEffectsCanvasProps {
	effect: GraphVisualEffect | undefined;
	nodesRef: React.MutableRefObject<GraphVizNode[]>;
	linksRef: React.MutableRefObject<GraphVizLink[]>;
	zoomTransformRef: React.MutableRefObject<{ x: number; y: number; k: number }>;
	canvasRef: React.RefObject<HTMLCanvasElement | null>;
	containerRef: React.RefObject<HTMLDivElement | null>;
	resizeTick: number;
	effectKindMap: Partial<Record<string, string[]>>;
}

function getKindsForEffect(effectType: string, effectKindMap: Partial<Record<string, string[]>>): string[] {
	return effectKindMap[effectType] ?? [];
}

export const GraphEffectsCanvas: React.FC<GraphEffectsCanvasProps> = ({
	effect,
	nodesRef,
	linksRef,
	zoomTransformRef,
	canvasRef,
	containerRef,
	resizeTick,
	effectKindMap,
}) => {
	useEffect(() => {
		const canvas = canvasRef.current;
		const container = containerRef.current;
		if (!canvas || !container) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		let raf = 0;
		let alive = true;
		const start = effect?.startedAtMs ?? Date.now();

		const drawGlowDot = (x: number, y: number, r: number, color: string, alpha: number) => {
			ctx.save();
			ctx.globalAlpha = alpha;
			ctx.fillStyle = color;
			ctx.shadowColor = color;
			ctx.shadowBlur = r * 3;
			ctx.beginPath();
			ctx.arc(x, y, r, 0, Math.PI * 2);
			ctx.fill();
			ctx.restore();
		};

		const drawLineGlow = (x1: number, y1: number, x2: number, y2: number, color: string, width: number, alpha: number) => {
			ctx.save();
			ctx.globalAlpha = alpha;
			ctx.strokeStyle = color;
			ctx.lineWidth = width;
			ctx.shadowColor = color;
			ctx.shadowBlur = width * 4;
			ctx.beginPath();
			ctx.moveTo(x1, y1);
			ctx.lineTo(x2, y2);
			ctx.stroke();
			ctx.restore();
		};

		const loop = () => {
			if (!alive) return;
			const now = Date.now();
			const t = (now - start) / 1000;
			const width = container.clientWidth || 400;
			const height = container.clientHeight || 400;

			ctx.clearRect(0, 0, width, height);

			const effType = effect?.type ?? 'none';
			const intensity = Math.max(0, Math.min(1, effect?.intensity ?? 0));
			if (effType === 'none' || intensity <= 0) {
				raf = requestAnimationFrame(loop);
				return;
			}

			const tr = zoomTransformRef.current;
			const toScreen = (x?: number, y?: number) => ({
				x: (x ?? 0) * tr.k + tr.x,
				y: (y ?? 0) * tr.k + tr.y,
			});

			const nodes = nodesRef.current;
			const links = linksRef.current;

			if (effType === 'scan') {
				const bandY = ((t * 120) % (height + 120)) - 60;
				const grad = ctx.createLinearGradient(0, bandY - 40, 0, bandY + 40);
				grad.addColorStop(0, 'rgba(124,58,237,0)');
				grad.addColorStop(0.5, `rgba(124,58,237,${0.18 * intensity})`);
				grad.addColorStop(1, 'rgba(124,58,237,0)');
				ctx.fillStyle = grad;
				ctx.fillRect(0, 0, width, height);
			}

			if (effType === 'filter') {
				ctx.fillStyle = `rgba(17,24,39,${0.20 * intensity})`;
				ctx.fillRect(0, 0, width, height);

				const focus = new Set((effect?.focusNodeIds ?? []).map(String));
				if (focus.size === 0) {
					const filterKinds = getKindsForEffect('filter', effectKindMap);
					for (const l of links) {
						if (!filterKinds.includes(l.kind)) continue;
						focus.add(getLinkEndpointId(l.source));
						focus.add(getLinkEndpointId(l.target));
					}
				}

				for (const n of nodes) {
					if (!focus.has(n.id)) continue;
					const p = toScreen(n.x, n.y);
					const pulse = 0.6 + 0.4 * Math.sin(t * 3);
					drawGlowDot(p.x, p.y, Math.max(6, n.r) * 0.9, '#60a5fa', 0.35 * intensity * pulse);
				}

				const bandX = ((t * 140) % (width + 140)) - 70;
				const gradX = ctx.createLinearGradient(bandX - 50, 0, bandX + 50, 0);
				gradX.addColorStop(0, 'rgba(96,165,250,0)');
				gradX.addColorStop(0.5, `rgba(96,165,250,${0.10 * intensity})`);
				gradX.addColorStop(1, 'rgba(96,165,250,0)');
				ctx.fillStyle = gradX;
				ctx.fillRect(0, 0, width, height);
			}

			if (effType === 'path') {
				const pathKinds = getKindsForEffect('path', effectKindMap);
				const pathEdges = links.filter((l) => pathKinds.includes(l.kind));
				let idx = 0;
				for (const l of pathEdges) {
					const aNode = typeof l.source === 'string' ? nodes.find((n) => n.id === l.source) : l.source;
					const bNode = typeof l.target === 'string' ? nodes.find((n) => n.id === l.target) : l.target;
					if (!aNode || !bNode) continue;
					const a = toScreen(aNode.x, aNode.y);
					const b = toScreen(bNode.x, bNode.y);
					drawLineGlow(a.x, a.y, b.x, b.y, '#22c55e', 2.0, 0.18 * intensity);

					const phase = (t * 0.9 + idx * 0.15) % 1;
					const x = a.x + (b.x - a.x) * phase;
					const y = a.y + (b.y - a.y) * phase;
					drawGlowDot(x, y, 3.0, '#22c55e', 0.75 * intensity);
					idx++;
				}
			}

			if (effType === 'semantic') {
				const semanticKinds = getKindsForEffect('semantic', effectKindMap);
				const pulse = 0.5 + 0.5 * Math.sin(t * 4);
				for (const l of links) {
					if (!semanticKinds.includes(l.kind)) continue;
					const aNode = typeof l.source === 'string' ? nodes.find((n) => n.id === l.source) : l.source;
					const bNode = typeof l.target === 'string' ? nodes.find((n) => n.id === l.target) : l.target;
					if (!aNode || !bNode) continue;
					const a = toScreen(aNode.x, aNode.y);
					const b = toScreen(bNode.x, bNode.y);
					drawLineGlow(a.x, a.y, b.x, b.y, '#60a5fa', 1.5, 0.12 * intensity * pulse);
					drawGlowDot(a.x, a.y, 2.5, '#60a5fa', 0.35 * intensity * pulse);
					drawGlowDot(b.x, b.y, 2.5, '#60a5fa', 0.35 * intensity * pulse);
				}
			}

			raf = requestAnimationFrame(loop);
		};

		raf = requestAnimationFrame(loop);
		return () => {
			alive = false;
			cancelAnimationFrame(raf);
			ctx.clearRect(0, 0, container.clientWidth || 400, container.clientHeight || 400);
		};
	}, [effect?.type, effect?.intensity, effect?.startedAtMs, resizeTick, effectKindMap]);
	return null;
};
