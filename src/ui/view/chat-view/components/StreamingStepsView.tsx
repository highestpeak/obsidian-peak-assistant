import React from 'react';
import {
	ChainOfThought,
	ChainOfThoughtHeader,
	ChainOfThoughtStep,
	ChainOfThoughtContent,
} from '@/ui/component/ai-elements';
import { Eye, FileText, Upload, Code, Wrench } from 'lucide-react';
import type { StreamingStep } from '@/ui/store/messageStore';

export interface StreamingStepsViewProps {
	steps: StreamingStep[];
	defaultOpen?: boolean;
}

/**
 * Component to display streaming processing steps using ChainOfThought
 */
export const StreamingStepsView: React.FC<StreamingStepsViewProps> = ({
	steps,
	defaultOpen = true,
}) => {
	if (steps.length === 0) {
		return null;
	}

	return (
		<div className="pktw-mb-3 pktw-w-full">
			<ChainOfThought defaultOpen={defaultOpen}>
				<ChainOfThoughtHeader>Processing Steps</ChainOfThoughtHeader>
				<ChainOfThoughtContent>
					{steps.map((step, index) => {
						// Map our status to ChainOfThought status
						const getStatus = (): 'complete' | 'active' | 'pending' => {
							switch (step.status) {
								case 'complete':
									return 'complete';
								case 'start':
									return 'active';
								case 'skip':
								case 'error':
									return 'complete'; // Show as complete but with error styling
								default:
									return 'pending';
							}
						};

						// Get icon based on stage
						const getIcon = () => {
							switch (step.stage) {
								case 'image_upload':
								case 'image_summary':
									return Eye;
								case 'pdf_upload':
								case 'pdf_parse':
									return FileText;
								case 'resource_summary':
									return Upload;
								case 'tools_enable':
									return Wrench;
								case 'codeinterpreter_enable':
									return Code;
								default:
									return undefined; // Use default DotIcon
							}
						};

						// Build description with resource info
						const description = step.resourceSource
							? `Processing: ${step.resourceSource.split('/').pop()}`
							: undefined;

						// Add error info to description if status is error
						const finalDescription = step.status === 'error'
							? `${description || step.label} (Error)`
							: step.status === 'skip'
								? `${description || step.label} (Skipped)`
								: description;

						return (
							<ChainOfThoughtStep
								key={index}
								icon={getIcon()}
								label={step.label}
								description={finalDescription}
								status={getStatus()}
							/>
						);
					})}
				</ChainOfThoughtContent>
			</ChainOfThought>
		</div>
	);
};
