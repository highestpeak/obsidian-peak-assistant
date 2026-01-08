import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
	DialogClose,
} from './dialog';
import { Button } from './button';
import { Input } from './input';
import { IconButton } from './icon-button';
import { X, Lightbulb } from 'lucide-react';

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
 * Lightweight modal for collecting single-line user text input
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

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="pktw-bg-white pktw-border-0 pktw-p-4 pktw-shadow-lg pktw-rounded-xl pktw-max-w-md pktw-w-full">
				<div className="pktw-flex pktw-items-start pktw-justify-between">
					<DialogHeader className="pktw-p-0 pktw-m-0">
						<DialogTitle className="pktw-text-lg pktw-font-medium pktw-text-gray-900 pktw-leading-tight pktw-m-0">
							{message}
						</DialogTitle>
					</DialogHeader>
					<DialogClose asChild>
						<IconButton
							onClick={() => onOpenChange(false)}
							className="pktw-text-gray-700 hover:pktw-text-gray-900 hover:pktw-bg-gray-100 pktw-transition-colors pktw-rounded-md"
							size="lg"
						>
							<X />
						</IconButton>
					</DialogClose>
				</div>
				<form onSubmit={handleSubmit(onSubmitForm)}>
					<div className="pktw-space-y-2">
						<div className="pktw-flex pktw-justify-center">
							<Input
								{...register('value', {
									required: 'This field is required',
								})}
								placeholder={placeholderText || message}
								autoFocus
								className="pktw-bg-white pktw-h-9 pktw-text-sm pktw-text-black pktw-border pktw-border-gray-300 pktw-border-solid focus:pktw-border-black pktw-transition-all pktw-rounded-xl"
								onKeyDown={(e) => {
									if (e.key === 'Escape') {
										onOpenChange(false);
									}
								}}
							/>
						</div>
						{errors.value && (
							<p className="pktw-text-xs pktw-text-red-500 pktw-mt-0.5">
								{errors.value.message}
							</p>
						)}
						{hintText && (
							<div className="pktw-flex pktw-items-center pktw-justify-start pktw-gap-2 pktw-mt-2">
								<Lightbulb className="pktw-w-4 pktw-h-4 pktw-text-gray-500 pktw-flex-shrink-0" />
								<p className="pktw-text-xs pktw-text-gray-600 pktw-leading-relaxed">
									{hintText}
								</p>
							</div>
						)}
					</div>
					<DialogFooter className="pktw-pt-3 pktw-pb-0 pktw-mt-0">
						<Button
							type="submit"
							className="pktw-bg-gray-900 hover:pktw-bg-gray-800 pktw-text-white pktw-h-9 pktw-px-4 pktw-text-sm pktw-font-medium pktw-rounded-xl pktw-w-full sm:pktw-w-auto"
						>
							{submitButtonText}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
};

