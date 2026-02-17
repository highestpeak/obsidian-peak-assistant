import React from 'react';

export interface GraphEmptyStateProps {
	message?: string;
}

/** Empty state overlay. Uses pointer-events-none so it does not block clicks (e.g. when switching hops). */
export const GraphEmptyState: React.FC<GraphEmptyStateProps> = ({
	message = 'Waiting for graph events…',
}) => (
	<div className="pktw-absolute pktw-inset-0 pktw-flex pktw-items-center pktw-justify-center pktw-pointer-events-none">
		<div className="pktw-text-sm pktw-text-[#999999]">{message}</div>
	</div>
);
