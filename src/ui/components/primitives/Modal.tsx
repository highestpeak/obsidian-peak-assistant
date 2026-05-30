import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import { IconButton } from './IconButton';

/** Modal Root — thin pass-through over Radix Dialog (isolates the `Modal.X` namespace). */
const ModalRoot: React.FC<React.ComponentProps<typeof DialogPrimitive.Root>> = (
	props
) => <DialogPrimitive.Root {...props} />;
ModalRoot.displayName = 'Modal';

const ModalTrigger = DialogPrimitive.Trigger;

const ModalOverlay = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Overlay>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
	<DialogPrimitive.Overlay
		ref={ref}
		className={cn('pk-modal-overlay', className)}
		{...props}
	/>
));
ModalOverlay.displayName = 'ModalOverlay';

export interface ModalContentProps
	extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
	width?: 'narrow' | 'default' | 'wide';
}

const ModalContent = React.forwardRef<
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
ModalContent.displayName = 'Modal.Content';

const ModalHeader = React.forwardRef<
	HTMLDivElement,
	React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
	<div
		ref={ref}
		className={cn('pk-modal-shell__head', className)}
		{...props}
	/>
));
ModalHeader.displayName = 'Modal.Header';

const ModalTitle = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Title>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
	<DialogPrimitive.Title
		ref={ref}
		className={cn('pk-modal-shell__title', className)}
		{...props}
	/>
));
ModalTitle.displayName = 'Modal.Title';

const ModalSubtitle = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Description>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
	<DialogPrimitive.Description
		ref={ref}
		className={cn('pk-modal-shell__sub', className)}
		{...props}
	/>
));
ModalSubtitle.displayName = 'Modal.Subtitle';

export interface ModalCloseProps
	extends Omit<
		React.ButtonHTMLAttributes<HTMLButtonElement>,
		'aria-label'
	> {
	label?: string;
}

const ModalClose = React.forwardRef<HTMLButtonElement, ModalCloseProps>(
	({ label = 'Close', className, ...props }, ref) => (
		<DialogPrimitive.Close asChild>
			<IconButton ref={ref} label={label} className={className} {...props}>
				<X />
			</IconButton>
		</DialogPrimitive.Close>
	)
);
ModalClose.displayName = 'Modal.Close';

const ModalBody = React.forwardRef<
	HTMLDivElement,
	React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
	<div
		ref={ref}
		className={cn('pk-modal-shell__body', className)}
		{...props}
	/>
));
ModalBody.displayName = 'Modal.Body';

const ModalFooter = React.forwardRef<
	HTMLDivElement,
	React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
	<div
		ref={ref}
		className={cn('pk-modal-shell__footer', className)}
		{...props}
	/>
));
ModalFooter.displayName = 'Modal.Footer';

/**
 * Compound Modal — `Modal` is the Radix Dialog root; sub-parts hang off it:
 * `Modal.Trigger / .Content (width: narrow|default|wide) / .Header / .Title /
 * .Subtitle / .Close / .Body / .Footer`. `Modal.Close` renders an `<IconButton>`
 * internally; the now-removed `.pk-modal-shell__close` CSS rule was a duplicate.
 */
export const Modal = Object.assign(ModalRoot, {
	Trigger: ModalTrigger,
	Content: ModalContent,
	Header: ModalHeader,
	Title: ModalTitle,
	Subtitle: ModalSubtitle,
	Close: ModalClose,
	Body: ModalBody,
	Footer: ModalFooter,
});
