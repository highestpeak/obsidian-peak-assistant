import React from 'react';
import { cn } from '@/ui/react/lib/utils';
import { GraphWorkspaceControl, type GraphWorkspaceControlProps } from './GraphWorkspaceControl';

export interface GraphWorkspaceProps extends GraphWorkspaceControlProps {
	children: React.ReactNode;
	contentClassName?: string;
}

export const GraphWorkspace: React.FC<GraphWorkspaceProps> = ({
	children, contentClassName, className, ...controlProps
}) => (
	<section
		className={cn('pk-graph-workspace pktw-flex pktw-min-h-0 pktw-flex-1 pktw-flex-col', className)}
		data-graph-workspace={controlProps.manifest.hostId}
	>
		<GraphWorkspaceControl {...controlProps} />
		<div className={cn('pk-graph-workspace__content pktw-relative pktw-min-h-0 pktw-flex-1', contentClassName)}>
			{children}
		</div>
	</section>
);
