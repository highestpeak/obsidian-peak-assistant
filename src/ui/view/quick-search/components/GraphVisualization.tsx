import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3-force';
import * as d3Selection from 'd3-selection';
import * as d3Drag from 'd3-drag';
import * as d3Zoom from 'd3-zoom';
import { ZoomIn, ZoomOut, Maximize2, Settings } from 'lucide-react';
import type { GraphPreview } from '@/core/storage/graph/types';

interface GraphConfig {
	linkDistance: number; // Link distance (default: 60)
	chargeStrength: number; // Repulsion strength (default: -300)
	collisionRadius: number; // Collision radius (default: 20)
}

const DEFAULT_CONFIG: GraphConfig = {
	linkDistance: 60,
	chargeStrength: -300,
	collisionRadius: 20,
};

export const GraphVisualization: React.FC<{
	graph?: GraphPreview | null;
}> = ({ graph }) => {
	const svgRef = useRef<SVGSVGElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const simulationRef = useRef<d3.Simulation<any, any> | null>(null);
	const zoomRef = useRef<d3Zoom.ZoomBehavior<Element, unknown> | null>(null);
	const nodesRef = useRef<any[]>([]);
	const linksRef = useRef<any[]>([]);
	
	const [config, setConfig] = useState<GraphConfig>(DEFAULT_CONFIG);
	const [showControls, setShowControls] = useState(false);
	const [zoomLevel, setZoomLevel] = useState(1);

	useEffect(() => {
		if (!graph || !graph.nodes?.length || !svgRef.current || !containerRef.current) {
			return;
		}

		const svg = d3Selection.select(svgRef.current);
		svg.selectAll('*').remove(); // Clear previous render

		const container = containerRef.current;
		const width = container.clientWidth || 400;
		const height = container.clientHeight || 400;

		// Prepare nodes and links
		const nodes = graph.nodes.slice(0, 30).map((n) => ({
			id: n.id,
			label: n.label || 'Untitled',
			type: n.type || 'document',
		}));

		const links = graph.edges
			.slice(0, 50)
			.filter((e) => nodes.some((n) => n.id === e.from_node_id) && nodes.some((n) => n.id === e.to_node_id))
			.map((e) => ({
				source: e.from_node_id,
				target: e.to_node_id,
				weight: e.weight || 1,
			}));

		nodesRef.current = nodes;
		linksRef.current = links;

		// Calculate center
		const centerX = width / 2;
		const centerY = height / 2;

		// Create force simulation with configurable parameters
		const simulation = d3
			.forceSimulation(nodes as any)
			.force(
				'link',
				d3
					.forceLink(links)
					.id((d: any) => d.id)
					.distance((d: any) => config.linkDistance + (1 - (d.weight || 1)) * 20)
					.strength(0.5),
			)
			.force('charge', d3.forceManyBody().strength(config.chargeStrength))
			.force('center', d3.forceCenter(centerX, centerY))
			.force('collision', d3.forceCollide().radius(config.collisionRadius));

		simulationRef.current = simulation;

		// Create SVG container with zoom
		const g = svg.append('g');

		// Set up zoom behavior - remove minimum scale limit
		const zoom = d3Zoom
			.zoom()
			.scaleExtent([0.01, 10]) // Allow very small scale to see full graph
			.on('zoom', (event) => {
				g.attr('transform', event.transform);
				setZoomLevel(event.transform.k);
			});

		zoomRef.current = zoom;
		svg.call(zoom as any);

		// Create links
		const link = g
			.append('g')
			.attr('stroke', '#d1d5db')
			.attr('stroke-opacity', 0.4)
			.selectAll('line')
			.data(links)
			.join('line')
			.attr('stroke-width', (d: any) => Math.max(1, Math.min(3, (d.weight || 1) * 2)));

		// Create nodes
		const node = g
			.append('g')
			.attr('stroke', '#fff')
			.attr('stroke-width', 2)
			.selectAll('circle')
			.data(nodes)
			.join('circle')
			.attr('r', (d: any) => (d.type === 'document' ? 12 : 10))
			.attr('fill', (d: any) => {
				if (d.type === 'document') return '#7c3aed';
				if (d.type === 'tag') return '#8b5cf6';
				return '#a78bfa';
			})
			.style('cursor', 'grab')
			.call(drag(simulation) as any);

		// Create labels
		const label = g
			.append('g')
			.selectAll('text')
			.data(nodes)
			.join('text')
			.text((d: any) => {
				const text = d.label || 'Untitled';
				return text.length > 15 ? text.substring(0, 15) + '...' : text;
			})
			.attr('font-size', '9px')
			.attr('fill', '#4b5563')
			.attr('text-anchor', 'middle')
			.attr('dy', '20px')
			.style('pointer-events', 'none')
			.style('user-select', 'none')
			.style('font-weight', '500');

		// Update positions on simulation tick
		simulation.on('tick', () => {
			link
				.attr('x1', (d: any) => d.source.x)
				.attr('y1', (d: any) => d.source.y)
				.attr('x2', (d: any) => d.target.x)
				.attr('y2', (d: any) => d.target.y);

			node.attr('cx', (d: any) => d.x).attr('cy', (d: any) => d.y);
			label.attr('x', (d: any) => d.x).attr('y', (d: any) => d.y);
		});

		// Initialize simulation
		simulation.alpha(1).restart();

		// Stop simulation after layout stabilizes and fit to view
		simulation.on('end', () => {
			fitToView();
		});

		// Auto-stop after reasonable time
		setTimeout(() => {
			simulation.alphaTarget(0);
		}, 3000);

		return () => {
			if (simulationRef.current) {
				simulationRef.current.stop();
			}
		};
	}, [graph, config]);

	// Update simulation when config changes
	useEffect(() => {
		if (!simulationRef.current) return;

		const simulation = simulationRef.current;
		const linkForce = simulation.force('link') as d3.ForceLink<any, any>;
		const chargeForce = simulation.force('charge') as d3.ForceManyBody<any>;
		const collisionForce = simulation.force('collision') as d3.ForceCollide<any>;

		if (linkForce) {
			linkForce.distance((d: any) => config.linkDistance + (1 - (d.weight || 1)) * 20);
		}
		if (chargeForce) {
			chargeForce.strength(config.chargeStrength);
		}
		if (collisionForce) {
			collisionForce.radius(config.collisionRadius);
		}

		simulation.alpha(0.3).restart();
	}, [config]);

	/**
	 * Fit graph to viewport
	 */
	const fitToView = () => {
		if (!svgRef.current || !zoomRef.current || nodesRef.current.length === 0) return;

		const nodes = nodesRef.current;
		let minX = Infinity, maxX = -Infinity;
		let minY = Infinity, maxY = -Infinity;
		
		nodes.forEach((n: any) => {
			if (n.x !== undefined && n.y !== undefined) {
				minX = Math.min(minX, n.x);
				maxX = Math.max(maxX, n.x);
				minY = Math.min(minY, n.y);
				maxY = Math.max(maxY, n.y);
			}
		});

		if (minX === Infinity || maxX === -Infinity) return;

		const container = containerRef.current;
		if (!container) return;

		const width = container.clientWidth || 400;
		const height = container.clientHeight || 400;
		const boundsWidth = maxX - minX;
		const boundsHeight = maxY - minY;
		const boundsCenterX = (minX + maxX) / 2;
		const boundsCenterY = (minY + maxY) / 2;
		
		// Calculate scale to fit graph in viewport (with padding)
		const padding = 40;
		const scaleX = (width - padding * 2) / boundsWidth;
		const scaleY = (height - padding * 2) / boundsHeight;
		const scale = Math.min(scaleX, scaleY, 1); // Don't scale up, only down
		
		// Calculate translation to center the graph
		const translateX = width / 2 - boundsCenterX * scale;
		const translateY = height / 2 - boundsCenterY * scale;
		
		// Apply transform
		const finalTransform = d3Zoom.zoomIdentity
			.translate(translateX, translateY)
			.scale(scale);
		
		const svg = d3Selection.select(svgRef.current);
		svg.call(zoomRef.current.transform as any, finalTransform);
		setZoomLevel(scale);
	};

	/**
	 * Zoom in/out
	 */
	const handleZoom = (delta: number) => {
		if (!svgRef.current || !zoomRef.current) return;
		const svg = d3Selection.select(svgRef.current);
		const currentTransform = d3Zoom.zoomTransform(svg.node() as SVGSVGElement);
		const newScale = Math.max(0.01, Math.min(10, currentTransform.k * delta));
		const newTransform = d3Zoom.zoomIdentity
			.translate(currentTransform.x, currentTransform.y)
			.scale(newScale);
		svg.call(zoomRef.current.transform as any, newTransform);
		setZoomLevel(newScale);
	};

	/**
	 * Reset zoom to fit view
	 */
	const handleResetZoom = () => {
		fitToView();
	};

	// Fallback placeholder
	if (!graph || !graph.nodes?.length) {
		return (
			<div className="pktw-w-full pktw-aspect-square pktw-bg-[#fafafa] pktw-rounded-md pktw-border pktw-border-[#e5e7eb] pktw-relative pktw-overflow-hidden pktw-flex pktw-items-center pktw-justify-center">
				<div className="pktw-text-sm pktw-text-[#999999]">No graph data available</div>
			</div>
		);
	}

	return (
		<div 
			ref={containerRef}
			className="pktw-w-full pktw-aspect-square pktw-bg-[#fafafa] pktw-rounded-md pktw-border pktw-border-[#e5e7eb] pktw-relative pktw-overflow-hidden"
		>
			{/* Control Panel */}
			<div className="pktw-absolute pktw-top-2 pktw-right-2 pktw-z-10 pktw-flex pktw-gap-1">
				{/* Zoom Controls */}
				<button
					onClick={() => handleZoom(1.2)}
					className="pktw-p-1.5 pktw-bg-white pktw-border pktw-border-[#e5e7eb] pktw-rounded pktw-shadow-sm hover:pktw-bg-[#f9fafb] pktw-transition-colors"
					title="Zoom In"
				>
					<ZoomIn className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#6c757d]" />
				</button>
				<button
					onClick={() => handleZoom(1 / 1.2)}
					className="pktw-p-1.5 pktw-bg-white pktw-border pktw-border-[#e5e7eb] pktw-rounded pktw-shadow-sm hover:pktw-bg-[#f9fafb] pktw-transition-colors"
					title="Zoom Out"
				>
					<ZoomOut className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#6c757d]" />
				</button>
				<button
					onClick={handleResetZoom}
					className="pktw-p-1.5 pktw-bg-white pktw-border pktw-border-[#e5e7eb] pktw-rounded pktw-shadow-sm hover:pktw-bg-[#f9fafb] pktw-transition-colors"
					title="Fit to View"
				>
					<Maximize2 className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#6c757d]" />
				</button>
				<button
					onClick={() => setShowControls(!showControls)}
					className={`pktw-p-1.5 pktw-border pktw-rounded pktw-shadow-sm pktw-transition-colors ${
						showControls 
							? 'pktw-bg-[#7c3aed] pktw-text-white pktw-border-[#7c3aed]' 
							: 'pktw-bg-white pktw-text-[#6c757d] pktw-border-[#e5e7eb] hover:pktw-bg-[#f9fafb]'
					}`}
					title="Settings"
				>
					<Settings className="pktw-w-3.5 pktw-h-3.5" />
				</button>
			</div>

			{/* Settings Panel */}
			{showControls && (
				<div className="pktw-absolute pktw-top-10 pktw-right-2 pktw-z-20 pktw-bg-white pktw-border pktw-border-[#e5e7eb] pktw-rounded-lg pktw-shadow-lg pktw-p-4 pktw-min-w-[240px]">
					<div className="pktw-text-sm pktw-font-semibold pktw-text-[#2e3338] pktw-mb-3">Graph Settings</div>
					
					{/* Link Distance */}
					<div className="pktw-mb-4">
						<label className="pktw-text-xs pktw-text-[#6c757d] pktw-block pktw-mb-1">
							Link Distance: {config.linkDistance}
						</label>
						<input
							type="range"
							min="20"
							max="150"
							step="5"
							value={config.linkDistance}
							onChange={(e) => setConfig(prev => ({ ...prev, linkDistance: Number(e.target.value) }))}
							className="pktw-w-full pktw-h-1.5 pktw-bg-[#e5e7eb] pktw-rounded-lg pktw-appearance-none pktw-cursor-pointer"
							style={{
								background: `linear-gradient(to right, #7c3aed 0%, #7c3aed ${((config.linkDistance - 20) / (150 - 20)) * 100}%, #e5e7eb ${((config.linkDistance - 20) / (150 - 20)) * 100}%, #e5e7eb 100%)`
							}}
						/>
					</div>

					{/* Charge Strength */}
					<div className="pktw-mb-4">
						<label className="pktw-text-xs pktw-text-[#6c757d] pktw-block pktw-mb-1">
							Repulsion: {config.chargeStrength}
						</label>
						<input
							type="range"
							min="-800"
							max="-50"
							step="25"
							value={config.chargeStrength}
							onChange={(e) => setConfig(prev => ({ ...prev, chargeStrength: Number(e.target.value) }))}
							className="pktw-w-full pktw-h-1.5 pktw-bg-[#e5e7eb] pktw-rounded-lg pktw-appearance-none pktw-cursor-pointer"
							style={{
								background: `linear-gradient(to right, #7c3aed 0%, #7c3aed ${((config.chargeStrength - (-800)) / (-50 - (-800))) * 100}%, #e5e7eb ${((config.chargeStrength - (-800)) / (-50 - (-800))) * 100}%, #e5e7eb 100%)`
							}}
						/>
					</div>

					{/* Collision Radius */}
					<div className="pktw-mb-3">
						<label className="pktw-text-xs pktw-text-[#6c757d] pktw-block pktw-mb-1">
							Collision Radius: {config.collisionRadius}
						</label>
						<input
							type="range"
							min="5"
							max="50"
							step="2"
							value={config.collisionRadius}
							onChange={(e) => setConfig(prev => ({ ...prev, collisionRadius: Number(e.target.value) }))}
							className="pktw-w-full pktw-h-1.5 pktw-bg-[#e5e7eb] pktw-rounded-lg pktw-appearance-none pktw-cursor-pointer"
							style={{
								background: `linear-gradient(to right, #7c3aed 0%, #7c3aed ${((config.collisionRadius - 5) / (50 - 5)) * 100}%, #e5e7eb ${((config.collisionRadius - 5) / (50 - 5)) * 100}%, #e5e7eb 100%)`
							}}
						/>
					</div>

					{/* Reset Button */}
					<button
						onClick={() => {
							setConfig(DEFAULT_CONFIG);
							setTimeout(fitToView, 100);
						}}
						className="pktw-w-full pktw-px-3 pktw-py-1.5 pktw-text-xs pktw-bg-[#f3f4f6] pktw-text-[#6c757d] pktw-rounded pktw-border pktw-border-[#e5e7eb] hover:pktw-bg-[#e5e7eb] pktw-transition-colors"
					>
						Reset to Default
					</button>
				</div>
			)}

			{/* Zoom Level Indicator */}
			<div className="pktw-absolute pktw-bottom-2 pktw-left-2 pktw-z-10 pktw-bg-white/80 pktw-backdrop-blur-sm pktw-px-2 pktw-py-1 pktw-rounded pktw-text-xs pktw-text-[#6c757d] pktw-border pktw-border-[#e5e7eb]">
				{Math.round(zoomLevel * 100)}%
			</div>

			<svg 
				ref={svgRef} 
				width="100%" 
				height="100%" 
				viewBox="0 0 400 400" 
				className="pktw-cursor-move"
				style={{ touchAction: 'none' }}
			/>
		</div>
	);
};

/**
 * Drag behavior for nodes
 */
function drag(simulation: d3.Simulation<any, any>) {
	function dragstarted(event: any, d: any) {
		if (!event.active) simulation.alphaTarget(0.3).restart();
		d.fx = d.x;
		d.fy = d.y;
	}

	function dragged(event: any, d: any) {
		d.fx = event.x;
		d.fy = event.y;
	}

	function dragended(event: any, d: any) {
		if (!event.active) simulation.alphaTarget(0);
		d.fx = null;
		d.fy = null;
	}

	return d3Drag
		.drag()
		.on('start', dragstarted)
		.on('drag', dragged)
		.on('end', dragended);
}
