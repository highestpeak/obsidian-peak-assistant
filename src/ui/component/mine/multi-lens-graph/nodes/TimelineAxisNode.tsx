import React from 'react';
import { Handle, Position } from '@xyflow/react';

export const TimelineAxisNode: React.FC<{ data: { ticks: Array<{ y: number; label: string }>; height: number } }> = ({ data }) => (
	<div style={{ width: 60, height: data.height, position: 'relative', pointerEvents: 'none' }}>
		{/* Vertical axis line */}
		<div style={{ position: 'absolute', left: 30, top: 0, width: 2, height: '100%', background: '#d1d5db' }} />
		{/* Ticks */}
		{data.ticks.map((t, i) => (
			<div key={i} style={{ position: 'absolute', top: t.y, left: 20 }}>
				<div style={{ width: 20, height: 1, background: '#9ca3af' }} />
				<span style={{
					fontSize: 10,
					color: '#6b7280',
					fontWeight: 500,
					whiteSpace: 'nowrap',
					position: 'absolute',
					top: -8,
					right: 24,
				}}>
					{t.label}
				</span>
			</div>
		))}
		<Handle type="target" position={Position.Top} style={{ display: 'none' }} />
		<Handle type="source" position={Position.Bottom} style={{ display: 'none' }} />
	</div>
);
