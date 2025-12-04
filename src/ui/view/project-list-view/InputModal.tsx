import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from '../../component/shared-ui/dialog';
import { Button } from '../../component/shared-ui/button';
import { Input } from '../../component/shared-ui/input';

interface InputModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	message: string;
	onSubmit: (value: string | null) => void;
	initialValue?: string;
}

interface FormData {
	value: string;
}

/**
 * Lightweight modal for collecting single-line user text input
 */
export const InputModal: React.FC<InputModalProps> = ({
	open,
	onOpenChange,
	message,
	onSubmit,
	initialValue = '',
}) => {
	const {
		register,
		handleSubmit,
		reset,
		formState: { errors },
	} = useForm<FormData>({
		defaultValues: {
			value: initialValue,
		},
	});

	useEffect(() => {
		if (open) {
			reset({ value: initialValue });
		}
	}, [open, initialValue, reset]);

	const onSubmitForm = (data: FormData) => {
		const value = data.value.trim() || null;
		onSubmit(value);
		onOpenChange(false);
	};

	const handleCancel = () => {
		onSubmit(null);
		onOpenChange(false);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{message}</DialogTitle>
				</DialogHeader>
				<form onSubmit={handleSubmit(onSubmitForm)}>
					<div className="pktw-space-y-4 pktw-py-4">
						<Input
							{...register('value', {
								required: 'This field is required',
							})}
							placeholder={message}
							autoFocus
							onKeyDown={(e) => {
								if (e.key === 'Escape') {
									handleCancel();
								}
							}}
						/>
						{errors.value && (
							<p className="pktw-text-sm pktw-text-destructive">{errors.value.message}</p>
						)}
					</div>
					<DialogFooter>
						<Button type="button" variant="outline" onClick={handleCancel}>
							Cancel
						</Button>
						<Button type="submit">OK</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
};

