import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/ui/react/lib/utils";

const Select = SelectPrimitive.Root;

const SelectGroup = SelectPrimitive.Group;

const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef<
	React.ElementRef<typeof SelectPrimitive.Trigger>,
	React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
	<SelectPrimitive.Trigger
		ref={ref}
		className={cn(
			"pktw-flex pktw-h-10 pktw-w-full pktw-items-center pktw-justify-between pktw-rounded-md pktw-border pktw-border-input pktw-bg-background pktw-px-3 pktw-py-2 pktw-text-sm pktw-ring-offset-background placeholder:pktw-text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pktw-cursor-not-allowed disabled:pktw-opacity-50 [&>span]:pktw-line-clamp-1",
			className
		)}
		{...props}
	>
		{children}
		<SelectPrimitive.Icon asChild>
			<ChevronDown className="pktw-h-4 pktw-w-4 pktw-opacity-50" />
		</SelectPrimitive.Icon>
	</SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectScrollUpButton = React.forwardRef<
	React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
	React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
	<SelectPrimitive.ScrollUpButton
		ref={ref}
		className={cn(
			"pktw-flex pktw-cursor-default pktw-items-center pktw-justify-center pktw-py-1",
			className
		)}
		{...props}
	>
		<ChevronUp className="pktw-h-4 pktw-w-4" />
	</SelectPrimitive.ScrollUpButton>
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

const SelectScrollDownButton = React.forwardRef<
	React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
	React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
	<SelectPrimitive.ScrollDownButton
		ref={ref}
		className={cn(
			"pktw-flex pktw-cursor-default pktw-items-center pktw-justify-center pktw-py-1",
			className
		)}
		{...props}
	>
		<ChevronDown className="pktw-h-4 pktw-w-4" />
	</SelectPrimitive.ScrollDownButton>
));
SelectScrollDownButton.displayName =
	SelectPrimitive.ScrollDownButton.displayName;

const SelectContent = React.forwardRef<
	React.ElementRef<typeof SelectPrimitive.Content>,
	React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => (
	<SelectPrimitive.Portal>
		<SelectPrimitive.Content
			ref={ref}
			className={cn(
				"pktw-relative pktw-z-50 pktw-max-h-96 pktw-min-w-[8rem] pktw-overflow-hidden pktw-rounded-md pktw-border pktw-bg-popover pktw-text-popover-foreground pktw-shadow-md data-[state=open]:pktw-animate-in data-[state=closed]:pktw-animate-out data-[state=closed]:pktw-fade-out-0 data-[state=open]:pktw-fade-in-0 data-[state=closed]:pktw-zoom-out-95 data-[state=open]:pktw-zoom-in-95 data-[side=bottom]:pktw-slide-in-from-top-2 data-[side=left]:pktw-slide-in-from-right-2 data-[side=right]:pktw-slide-in-from-left-2 data-[side=top]:pktw-slide-in-from-bottom-2",
				position === "popper" &&
					"data-[side=bottom]:pktw-translate-y-1 data-[side=left]:pktw--translate-x-1 data-[side=right]:pktw-translate-x-1 data-[side=top]:pktw--translate-y-1",
				className
			)}
			position={position}
			{...props}
		>
			<SelectScrollUpButton />
			<SelectPrimitive.Viewport
				className={cn(
					"pktw-p-1",
					position === "popper" &&
						"pktw-h-[var(--radix-select-trigger-height)] pktw-w-full pktw-min-w-[var(--radix-select-trigger-width)]"
				)}
			>
				{children}
			</SelectPrimitive.Viewport>
			<SelectScrollDownButton />
		</SelectPrimitive.Content>
	</SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectLabel = React.forwardRef<
	React.ElementRef<typeof SelectPrimitive.Label>,
	React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
	<SelectPrimitive.Label
		ref={ref}
		className={cn("pktw-py-1.5 pktw-pl-8 pktw-pr-2 pktw-text-sm pktw-font-semibold", className)}
		{...props}
	/>
));
SelectLabel.displayName = SelectPrimitive.Label.displayName;

const SelectItem = React.forwardRef<
	React.ElementRef<typeof SelectPrimitive.Item>,
	React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
	<SelectPrimitive.Item
		ref={ref}
		className={cn(
			"pktw-relative pktw-flex pktw-w-full pktw-cursor-default pktw-select-none pktw-items-center pktw-rounded-sm pktw-py-1.5 pktw-pl-8 pktw-pr-2 pktw-text-sm pktw-outline-none focus:pktw-bg-accent focus:pktw-text-accent-foreground data-[disabled]:pktw-pointer-events-none data-[disabled]:pktw-opacity-50",
			className
		)}
		{...props}
	>
		<span className="pktw-absolute pktw-left-2 pktw-flex pktw-h-3.5 pktw-w-3.5 pktw-items-center pktw-justify-center">
			<SelectPrimitive.ItemIndicator>
				<Check className="pktw-h-4 pktw-w-4" />
			</SelectPrimitive.ItemIndicator>
		</span>

		<SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
	</SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

const SelectSeparator = React.forwardRef<
	React.ElementRef<typeof SelectPrimitive.Separator>,
	React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
	<SelectPrimitive.Separator
		ref={ref}
		className={cn("pktw--mx-1 pktw-my-1 pktw-h-px pktw-bg-muted", className)}
		{...props}
	/>
));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

export {
	Select,
	SelectGroup,
	SelectValue,
	SelectTrigger,
	SelectContent,
	SelectLabel,
	SelectItem,
	SelectSeparator,
	SelectScrollUpButton,
	SelectScrollDownButton,
};

