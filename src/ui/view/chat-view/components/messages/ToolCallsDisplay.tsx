import React from 'react';
import { Loader2 } from 'lucide-react';
import { type ToolCallInfo } from '@/ui/view/chat-view/store/messageStore';
import {
	Task,
	TaskItem,
	TaskTrigger,
	TaskContent,
} from '@/ui/component/ai-elements';

/**
 * Component for rendering tool calls display
 */
export const ToolCallsDisplay: React.FC<{
	expanded: boolean;
	toolCalls: ToolCallInfo[];
}> = ({ expanded, toolCalls }) => {
	return (
		<div className="pktw-w-full pktw-space-y-2">
			{toolCalls.map((toolCall, index) => (
				<Task key={index} defaultOpen={false}>
					<TaskTrigger title={toolCall.toolName} />
					<TaskContent>
						<TaskItem>
							{toolCall.input && (
								<div className="pktw-text-xs pktw-text-muted-foreground pktw-mb-2">
									<strong>Input:</strong>
									<pre className="pktw-whitespace-pre-wrap pktw-mt-1">{JSON.stringify(toolCall.input, null, 2)}</pre>
								</div>
							)}
							{toolCall.output && (
								<div className="pktw-text-xs pktw-text-muted-foreground pktw-mb-2">
									<strong>Output:</strong>
									<pre className="pktw-whitespace-pre-wrap pktw-mt-1">{JSON.stringify(toolCall.output, null, 2)}</pre>
								</div>
							)}
							{toolCall.isActive && (
								<div className="pktw-flex pktw-items-center pktw-mt-2">
									<Loader2 className="pktw-size-3 pktw-animate-spin pktw-text-muted-foreground pktw-mr-2" />
									<span className="pktw-text-xs pktw-text-muted-foreground">Running...</span>
								</div>
							)}
						</TaskItem>
					</TaskContent>
				</Task>
			))}
		</div>
	);
};
