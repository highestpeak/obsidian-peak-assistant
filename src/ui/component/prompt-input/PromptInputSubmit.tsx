import React from 'react';
import { Button } from '@/ui/component/shared-ui/button';
import { cn } from '@/ui/react/lib/utils';
import { CornerDownLeft, Loader2, Square, X } from 'lucide-react';
import type { PromptInputStatus } from './types';

export interface PromptInputSubmitProps {
	status?: PromptInputStatus;
	className?: string;
	disabled?: boolean;
	onCancel?: () => void | Promise<void>;
}

/**
 * Submit button component
 */
export const PromptInputSubmit: React.FC<PromptInputSubmitProps> = ({
	status = 'ready',
	className,
	disabled,
	onCancel,
	...props
}) => {
	let Icon = <CornerDownLeft className="pktw-size-5" />;

	if (status === 'submitted') {
		Icon = <Loader2 className="pktw-size-5 pktw-animate-spin" />;
	} else if (status === 'streaming') {
		Icon = <Square className="pktw-size-5" />;
	} else if (status === 'error') {
		Icon = <X className="pktw-size-5" />;
	}

	// In streaming mode, button should be clickable to cancel
	const isStreaming = status === 'streaming';
	const handleClick = isStreaming && onCancel 
		? async (e: React.MouseEvent<HTMLButtonElement>) => {
			e.preventDefault();
			e.stopPropagation();
			await onCancel();
		}
		: undefined;

	return (
		<Button
			type={isStreaming ? 'button' : 'submit'}
			variant="default"
			size="icon"
			className={cn(
				'pktw-h-8 pktw-w-8 pktw-rounded-md',
				className
			)}
			disabled={disabled || (status === 'submitted' && !isStreaming)}
			onClick={handleClick}
			{...props}
		>
			{Icon}
		</Button>
	);
};

