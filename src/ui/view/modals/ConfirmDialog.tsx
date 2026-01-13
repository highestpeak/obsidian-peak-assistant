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
		<div className="pktw-bg-white pktw-border pktw-border-gray-200 pktw-p-3 pktw-shadow-lg pktw-rounded-xl pktw-w-full">
			<div className="pktw-mb-4">
				<span className="pktw-text-lg pktw-font-medium pktw-text-gray-900 pktw-leading-tight pktw-mb-2">
					{title}
				</span>
			</div>

			<div className="pktw-mb-4">
				<span className="pktw-text-sm pktw-text-gray-700 pktw-leading-relaxed">
					{message}
				</span>
			</div>

			{requireConfirmationText && (
				<div className="pktw-mb-6">
					<label className="pktw-block pktw-text-sm pktw-font-medium pktw-text-gray-700 pktw-mb-2">
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
					className="pktw-px-4 pktw-py-2 pktw-text-sm pktw-font-medium pktw-rounded-lg pktw-border pktw-border-gray-300 hover:pktw-bg-gray-50"
				>
					{cancelText}
				</Button>
				<Button
					onClick={handleConfirm}
					disabled={requireConfirmationText ? confirmationInput !== requireConfirmationText : false}
					className="pktw-px-4 pktw-py-2 pktw-text-sm pktw-font-medium pktw-rounded-lg pktw-bg-red-500 hover:pktw-bg-red-600 pktw-text-white disabled:pktw-opacity-50 disabled:pktw-cursor-not-allowed disabled:hover:pktw-bg-red-500"
				>
					{confirmText}
				</Button>
			</div>
		</div>
	);
};