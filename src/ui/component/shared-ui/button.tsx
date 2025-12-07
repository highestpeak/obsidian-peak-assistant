import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/ui/react/lib/utils';

const buttonVariants = cva(
	'pktw-inline-flex pktw-items-center pktw-justify-center pktw-whitespace-nowrap pktw-rounded-md pktw-text-sm pktw-font-medium pktw-transition-colors focus-visible:pktw-outline-none focus-visible:pktw-ring-2 focus-visible:pktw-ring-ring focus-visible:pktw-ring-offset-2 disabled:pktw-pointer-events-none disabled:pktw-opacity-50',
	{
		variants: {
			variant: {
				default: 'pktw-bg-primary pktw-text-primary-foreground hover:pktw-bg-primary/90',
				destructive: 'pktw-bg-destructive pktw-text-destructive-foreground hover:pktw-bg-destructive/90',
				outline: 'pktw-border pktw-border-input pktw-bg-background hover:pktw-bg-accent hover:pktw-text-accent-foreground',
				secondary: 'pktw-bg-secondary pktw-text-secondary-foreground hover:pktw-bg-secondary/80',
				ghost: 'hover:pktw-bg-accent hover:pktw-text-accent-foreground',
				link: 'pktw-text-primary pktw-underline-offset-4 hover:pktw-underline',
			},
			size: {
				default: 'pktw-h-10 pktw-px-4 pktw-py-2',
				sm: 'pktw-h-9 pktw-rounded-md pktw-px-3',
				lg: 'pktw-h-11 pktw-rounded-md pktw-px-8',
				icon: 'pktw-h-10 pktw-w-10',
				xs: '!pktw-h-2 !pktw-w-2 !pktw-p-0',
			},
		},
		defaultVariants: {
			variant: 'default',
			size: 'default',
		},
	}
);     

export interface ButtonProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement>,
		VariantProps<typeof buttonVariants> {
	asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
	({ className, variant, size, asChild = false, ...props }, ref) => {
		const Comp = asChild ? Slot : 'button';
		return (
			<Comp
				className={cn(buttonVariants({ variant, size, className }))}
				ref={ref}
				{...props}
			/>
		);
	}
);
Button.displayName = 'Button';

export { Button, buttonVariants };

