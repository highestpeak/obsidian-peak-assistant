import React, { useState } from 'react';
import { Button } from '@/ui/component/shared-ui/button';
import { Input } from '@/ui/component/shared-ui/input';

interface ConfirmDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	message: string;
	onConfirm: () => void;
	onCancel?: () => void;
	confirmText?: string;
	cancelText?: string;
	requireConfirmationText?: string;
}

/**
 * Reusable confirmation dialog component
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
	open,
	onOpenChange,
	title,
	message,
	onConfirm,
	onCancel,
	confirmText = 'Confirm',
	cancelText = 'Cancel',
	requireConfirmationText,
}) => {
	const [confirmationInput, setConfirmationInput] = useState('');

	const handleConfirm = () => {
		if (requireConfirmationText && confirmationInput !== requireConfirmationText) {
			return;
		}
		onConfirm();
		onOpenChange(false);
		setConfirmationInput('');
	};

	const handleCancel = () => {
		onCancel?.();
		onOpenChange(false);
		setConfirmationInput('');
	};

	return (
		<div className="pktw-bg-popover pktw-border pktw-border-border pktw-p-3 pktw-shadow-lg pktw-rounded-xl pktw-w-full">
			<div className="pktw-mb-4">
				<span className="pktw-text-lg pktw-font-medium pktw-text-foreground pktw-leading-tight pktw-mb-2">
					{title}
				</span>
			</div>

			<div className="pktw-mb-4">
				<span className="pktw-text-sm pktw-text-pk-text-secondary pktw-leading-relaxed">
					{message}
				</span>
			</div>

			{requireConfirmationText && (
				<div className="pktw-mb-6">
					<label className="pktw-block pktw-text-sm pktw-font-medium pktw-text-pk-text-secondary pktw-mb-2">
						Type "{requireConfirmationText}" to confirm:
					</label>
					<Input
						type="text"
						value={confirmationInput}
						onChange={(e) => setConfirmationInput(e.target.value)}
						onPaste={(e) => e.preventDefault()}
						className="pktw-w-full pktw-text-sm pktw-box-border"
						placeholder={`Enter "${requireConfirmationText}"`}
						autoFocus
					/>
				</div>
			)}

			<div className="pktw-flex pktw-gap-3 pktw-justify-end">
				<Button
					onClick={handleCancel}
					variant="ghost"
					className="pktw-px-4 pktw-py-2 pktw-text-sm pktw-font-medium pktw-rounded-lg pktw-border pktw-border-border hover:pktw-bg-muted"
				>
					{cancelText}
				</Button>
				<Button
					onClick={handleConfirm}
					disabled={requireConfirmationText ? confirmationInput !== requireConfirmationText : false}
					className="pktw-px-4 pktw-py-2 pktw-text-sm pktw-font-medium pktw-rounded-lg pktw-bg-pk-error hover:pktw-bg-pk-error-text pktw-text-white disabled:pktw-opacity-50 disabled:pktw-cursor-not-allowed disabled:hover:pktw-bg-pk-error"
				>
					{confirmText}
				</Button>
			</div>
		</div>
	);
};