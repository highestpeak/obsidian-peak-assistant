import * as React from 'react';
import { cn } from '@/ui/react/lib/utils';

export interface SettingFieldProps {
	label: string;
	description?: string;
	children: React.ReactNode;
	className?: string;
	labelClassName?: string;
	descriptionClassName?: string;
}

/**
 * Container component for settings form fields with label and description.
 */
export function SettingField({
	label,
	description,
	children,
	className,
	labelClassName,
	descriptionClassName,
}: SettingFieldProps) {
	return (
		<div className={cn('pktw-mb-6', className)}>
			<label className={cn('pktw-block pktw-text-sm pktw-font-medium pktw-text-foreground pktw-mb-2', labelClassName)}>
				{label}
			</label>
			{description && (
				<p className={cn('pktw-text-xs pktw-text-muted-foreground pktw-mb-2', descriptionClassName)}>
					{description}
				</p>
			)}
			{children}
		</div>
	);
}
