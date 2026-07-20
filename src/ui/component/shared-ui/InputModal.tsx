import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Lightbulb } from 'lucide-react';
import { Modal } from '@/ui/components/primitives/Modal';
import { Button } from '@/ui/components/primitives/Button';
import { Input } from './input';

interface InputModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	message: string;
	onSubmit: (value: string | null) => void;
	initialValue?: string;
	placeholderText?: string;
	hintText?: string;
	submitButtonText?: string;
}

interface FormData {
	value: string;
}

/**
 * Lightweight modal for collecting single-line user text input.
 * Migrated to use the Modal primitive (was @radix-ui Dialog wrapper).
 */
export const InputModal: React.FC<InputModalProps> = ({
	open,
	onOpenChange,
	message,
	onSubmit,
	initialValue = '',
	placeholderText,
	hintText,
	submitButtonText = 'OK',
}) => {
	const {
		register,
		handleSubmit,
		reset,
		formState: { errors },
	} = useForm<FormData>({ defaultValues: { value: initialValue } });

	useEffect(() => {
		if (open) reset({ value: initialValue });
	}, [open, initialValue, reset]);

	const onSubmitForm = (data: FormData) => {
		onSubmit(data.value.trim() || null);
		onOpenChange(false);
	};

	return (
		<Modal open={open} onOpenChange={onOpenChange}>
			<Modal.Content width="narrow" portalClassName="peak-design-root">
				<Modal.Header>
					<Modal.Title>{message}</Modal.Title>
					<Modal.Close />
				</Modal.Header>
				<form onSubmit={handleSubmit(onSubmitForm)}>
					<Modal.Body>
						<Input
							{...register('value', { required: 'This field is required' })}
							placeholder={placeholderText || message}
							autoFocus
							onKeyDown={(e) => {
								if (e.key === 'Escape') onOpenChange(false);
							}}
						/>
						{errors.value && (
							<p className="pktw-text-xs pktw-text-pk-error pktw-mt-1">
								{errors.value.message}
							</p>
						)}
						{hintText && (
							<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mt-2">
								<Lightbulb className="pktw-w-4 pktw-h-4 pktw-text-pk-text-muted pktw-shrink-0" />
								<p className="pktw-text-xs pktw-text-pk-text-muted">{hintText}</p>
							</div>
						)}
					</Modal.Body>
					<Modal.Footer>
						<Button type="submit" variant="primary">
							{submitButtonText}
						</Button>
					</Modal.Footer>
				</form>
			</Modal.Content>
		</Modal>
	);
};
