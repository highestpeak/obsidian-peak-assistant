import React from 'react';
import { Button } from '@/ui/component/shared-ui/button';
import { usePromptInputContext } from './PromptInput';
import { Plus } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';

export interface PromptInputFileButtonProps {
	className?: string;
}

/**
 * File upload button - directly opens file dialog on click
 */
export const PromptInputFileButton: React.FC<PromptInputFileButtonProps> = ({
	className,
}) => {
	const { attachments } = usePromptInputContext();

	return (
		<Button
			variant="ghost"
			size="icon"
			className={cn(
				'pktw-h-9 pktw-w-9 pktw-border-0 pktw-shadow-none',
				'hover:pktw-bg-accent hover:pktw-text-accent-foreground',
				className
			)}
			onClick={attachments.openFileDialog}
			type="button"
		>
			<Plus className="pktw-size-6" />
		</Button>
	);
};

