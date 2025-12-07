import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '@/ui/react/lib/utils';

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Overlay>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
	<DialogPrimitive.Overlay
		ref={ref}
		className={cn(
			'pktw-fixed pktw-inset-0 pktw-z-50 pktw-bg-gray-500/20 data-[state=open]:pktw-animate-in data-[state=closed]:pktw-animate-out data-[state=closed]:pktw-fade-out-0 data-[state=open]:pktw-fade-in-0',
			className
		)}
		{...props}
	/>
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Content>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
	<DialogPortal>
		<DialogOverlay />
		<DialogPrimitive.Content
			ref={ref}
			className={cn(
				'pktw-fixed pktw-left-[50%] pktw-top-[50%] pktw-z-50 pktw-grid pktw-w-full pktw-max-w-lg pktw-translate-x-[-50%] pktw-translate-y-[-50%] pktw-gap-4 pktw-border pktw-bg-background pktw-p-6 pktw-shadow-xl pktw-duration-300 pktw-transition-all data-[state=open]:pktw-animate-in data-[state=closed]:pktw-animate-out data-[state=closed]:pktw-fade-out-0 data-[state=open]:pktw-fade-in-0 data-[state=closed]:pktw-zoom-out-95 data-[state=open]:pktw-zoom-in-95 data-[state=closed]:pktw-slide-out-to-left-1/2 data-[state=closed]:pktw-slide-out-to-top-[48%] data-[state=open]:pktw-slide-in-from-left-1/2 data-[state=open]:pktw-slide-in-from-top-[48%] sm:pktw-rounded-xl',
				className
			)}
			{...props}
		>
			{children}
		</DialogPrimitive.Content>
	</DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) => (
	<div
		className={cn(
			'pktw-flex pktw-flex-col pktw-space-y-1.5 pktw-text-center sm:pktw-text-left',
			className
		)}
		{...props}
	/>
);
DialogHeader.displayName = 'DialogHeader';

const DialogFooter = ({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) => (
	<div
		className={cn(
			'pktw-flex pktw-flex-col-reverse sm:pktw-flex-row sm:pktw-justify-end sm:pktw-space-x-2',
			className
		)}
		{...props}
	/>
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Title>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
	<DialogPrimitive.Title
		ref={ref}
		className={cn(
			'pktw-text-lg pktw-font-semibold pktw-leading-none pktw-tracking-tight',
			className
		)}
		{...props}
	/>
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Description>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
	<DialogPrimitive.Description
		ref={ref}
		className={cn('pktw-text-sm pktw-text-muted-foreground', className)}
		{...props}
	/>
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
	Dialog,
	DialogPortal,
	DialogOverlay,
	DialogClose,
	DialogTrigger,
	DialogContent,
	DialogHeader,
	DialogFooter,
	DialogTitle,
	DialogDescription,
};

