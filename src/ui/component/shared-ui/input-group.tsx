import * as React from "react";
import { Button } from "@/ui/component/shared-ui/button";
import { cn } from "@/ui/react/lib/utils";

export interface InputGroupProps extends React.HTMLAttributes<HTMLDivElement> {}

export const InputGroup = React.forwardRef<HTMLDivElement, InputGroupProps>(
	({ className, ...props }, ref) => {
		return (
			<div
				ref={ref}
				className={cn("pktw-flex pktw-items-center pktw-gap-2", className)}
				{...props}
			/>
		);
	}
);
InputGroup.displayName = "InputGroup";

export interface InputGroupAddonProps extends React.HTMLAttributes<HTMLDivElement> {
	align?: "block-start" | "block-end" | "inline-start" | "inline-end";
}

export const InputGroupAddon = React.forwardRef<HTMLDivElement, InputGroupAddonProps>(
	({ className, align, ...props }, ref) => {
		return (
			<div
				ref={ref}
				className={cn(
					"pktw-flex pktw-items-center",
					align === "block-start" && "pktw-self-start",
					align === "block-end" && "pktw-self-end",
					align === "inline-start" && "pktw-order-first",
					align === "inline-end" && "pktw-order-last",
					className
				)}
				{...props}
			/>
		);
	}
);
InputGroupAddon.displayName = "InputGroupAddon";

export interface InputGroupButtonProps extends React.ComponentProps<typeof Button> {}

export const InputGroupButton = React.forwardRef<
	HTMLButtonElement,
	InputGroupButtonProps
>(({ className, ...props }, ref) => {
	return <Button ref={ref} className={cn(className)} {...props} />;
});
InputGroupButton.displayName = "InputGroupButton";

export interface InputGroupTextareaProps
	extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const InputGroupTextarea = React.forwardRef<
	HTMLTextAreaElement,
	InputGroupTextareaProps
>(({ className, ...props }, ref) => {
	return (
		<textarea
			ref={ref}
			className={cn(
				"pktw-flex pktw-min-h-[60px] pktw-w-full pktw-rounded-md pktw-border pktw-border-input pktw-bg-background pktw-px-3 pktw-py-2 pktw-text-sm pktw-ring-offset-background placeholder:pktw-text-muted-foreground focus-visible:pktw-outline-none focus-visible:pktw-ring-2 focus-visible:pktw-ring-ring focus-visible:pktw-ring-offset-2 disabled:pktw-cursor-not-allowed disabled:pktw-opacity-50 pktw-resize-none",
				className
			)}
			{...props}
		/>
	);
});
InputGroupTextarea.displayName = "InputGroupTextarea";

