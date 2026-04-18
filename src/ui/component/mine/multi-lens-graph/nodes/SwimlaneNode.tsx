import React from 'react';
import { Handle, Position } from '@xyflow/react';

export const SwimlaneNode: React.FC<{ data: { label: string; width: number; height: number } }> = ({ data }) => (
	<div
		style={{
			width: data.width,
			height: data.height,
			border: '1px dashed #d1d5db',
			borderRadius: 8,
			background: 'rgba(249,250,251,0.5)',
			padding: '8px 12px',
			pointerEvents: 'none',
		}}
	>
		<span style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
			{data.label}
		</span>
		<Handle type="target" position={Position.Left} style={{ display: 'none' }} />
		<Handle type="source" position={Position.Right} style={{ display: 'none' }} />
	</div>
);
