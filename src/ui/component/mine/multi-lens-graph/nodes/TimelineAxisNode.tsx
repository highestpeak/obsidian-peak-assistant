import React from 'react';
import { Handle, Position } from '@xyflow/react';

export const TimelineAxisNode: React.FC<{ data: { ticks: Array<{ x: number; label: string }>; width: number } }> = ({ data }) => (
	<div style={{ width: data.width, height: 40, position: 'relative', pointerEvents: 'none' }}>
		{/* Axis line */}
		<div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 2, background: '#d1d5db' }} />
		{/* Ticks */}
		{data.ticks.map((t, i) => (
			<div key={i} style={{ position: 'absolute', left: t.x, top: -4 }}>
				<div style={{ width: 1, height: 10, background: '#9ca3af' }} />
				<span style={{ fontSize: 9, color: '#9ca3af', whiteSpace: 'nowrap', position: 'absolute', top: 12, left: -15 }}>
					{t.label}
				</span>
			</div>
		))}
		<Handle type="target" position={Position.Left} style={{ display: 'none' }} />
		<Handle type="source" position={Position.Right} style={{ display: 'none' }} />
	</div>
);
