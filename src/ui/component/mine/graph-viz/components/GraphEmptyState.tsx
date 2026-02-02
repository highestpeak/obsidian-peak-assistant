import React from 'react';

export interface GraphEmptyStateProps {
	message?: string;
}

export const GraphEmptyState: React.FC<GraphEmptyStateProps> = ({
	message = 'Waiting for graph events…',
}) => (
	<div className="pktw-absolute pktw-inset-0 pktw-flex pktw-items-center pktw-justify-center">
		<div className="pktw-text-sm pktw-text-[#999999]">{message}</div>
	</div>
);
