import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import { IconButton } from './IconButton';

/** Modal Root — Radix Dialog. Pass `open` + `onOpenChange` for controlled use. */
export const Modal = DialogPrimitive.Root;

/** Modal Trigger — Radix Dialog Trigger. */
export const ModalTrigger = DialogPrimitive.Trigger;

const ModalOverlay = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Overlay>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
	<DialogPrimitive.Overlay
		ref={ref}
		data-open="true"
		className={cn('pk-modal-overlay', className)}
		{...props}
	/>
));
ModalOverlay.displayName = 'ModalOverlay';

export interface ModalContentProps
	extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
	width?: 'narrow' | 'default' | 'wide';
}

/** Modal shell — overlay + width-aware shell. Renders into Radix Portal. */
export const ModalContent = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Content>,
	ModalContentProps
>(({ className, width = 'default', children, ...props }, ref) => (
	<DialogPrimitive.Portal>
		<ModalOverlay />
		<DialogPrimitive.Content
			ref={ref}
			className={cn(
				'pk-modal-shell',
				width === 'narrow' && 'pk-modal-shell--narrow',
				width === 'wide' && 'pk-modal-shell--wide',
				className
			)}
			{...props}
		>
			{children}
		</DialogPrimitive.Content>
	</DialogPrimitive.Portal>
));
ModalContent.displayName = 'ModalContent';

/** Modal header — flex row containing title block + ModalClose. */
export const ModalHeader = React.forwardRef<
	HTMLDivElement,
	React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
	<div
		ref={ref}
		className={cn('pk-modal-shell__head', className)}
		{...props}
	/>
));
ModalHeader.displayName = 'ModalHeader';

/** Modal title — Radix DialogTitle for screen readers. */
export const ModalTitle = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Title>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
	<DialogPrimitive.Title
		ref={ref}
		className={cn('pk-modal-shell__title', className)}
		{...props}
	/>
));
ModalTitle.displayName = 'ModalTitle';

/** Modal subtitle — Radix DialogDescription. */
export const ModalSubtitle = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Description>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
	<DialogPrimitive.Description
		ref={ref}
		className={cn('pk-modal-shell__sub', className)}
		{...props}
	/>
));
ModalSubtitle.displayName = 'ModalSubtitle';

export interface ModalCloseProps
	extends Omit<
		React.ButtonHTMLAttributes<HTMLButtonElement>,
		'aria-label'
	> {
	label?: string;
}

/**
 * Close affordance — renders an `<IconButton>` (which applies `.pk-icon-btn`)
 * wired to Radix DialogClose. Deduplicates the now-removed
 * `.pk-modal-shell__close` CSS rule.
 */
export const ModalClose = React.forwardRef<HTMLButtonElement, ModalCloseProps>(
	({ label = 'Close', className, ...props }, ref) => (
		<DialogPrimitive.Close asChild>
			<IconButton ref={ref} label={label} className={className} {...props}>
				<X />
			</IconButton>
		</DialogPrimitive.Close>
	)
);
ModalClose.displayName = 'ModalClose';

/** Modal body — scrollable content region. */
export const ModalBody = React.forwardRef<
	HTMLDivElement,
	React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
	<div
		ref={ref}
		className={cn('pk-modal-shell__body', className)}
		{...props}
	/>
));
ModalBody.displayName = 'ModalBody';

/** Modal footer — right-aligned action bar. */
export const ModalFooter = React.forwardRef<
	HTMLDivElement,
	React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
	<div
		ref={ref}
		className={cn('pk-modal-shell__footer', className)}
		{...props}
	/>
));
ModalFooter.displayName = 'ModalFooter';
