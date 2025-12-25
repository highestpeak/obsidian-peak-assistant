import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Check, ChevronRight, Circle } from "lucide-react";
import { cn } from "@/ui/react/lib/utils";

const DropdownMenu = DropdownMenuPrimitive.Root;

const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

const DropdownMenuGroup = DropdownMenuPrimitive.Group;

const DropdownMenuPortal = DropdownMenuPrimitive.Portal;

const DropdownMenuSub = DropdownMenuPrimitive.Sub;

const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

const DropdownMenuSubTrigger = React.forwardRef<
	React.ElementRef<typeof DropdownMenuPrimitive.SubTrigger>,
	React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger> & {
		inset?: boolean;
	}
>(({ className, inset, children, ...props }, ref) => (
	<DropdownMenuPrimitive.SubTrigger
		ref={ref}
		className={cn(
			"pktw-flex pktw-cursor-default pktw-select-none pktw-items-center pktw-rounded-sm pktw-px-2 pktw-py-1.5 pktw-text-sm pktw-outline-none focus:pktw-bg-accent data-[state=open]:pktw-bg-accent",
			inset && "pktw-pl-8",
			className
		)}
		{...props}
	>
		{children}
		<ChevronRight className="pktw-ml-auto pktw-h-4 pktw-w-4" />
	</DropdownMenuPrimitive.SubTrigger>
));
DropdownMenuSubTrigger.displayName = DropdownMenuPrimitive.SubTrigger.displayName;

const DropdownMenuSubContent = React.forwardRef<
	React.ElementRef<typeof DropdownMenuPrimitive.SubContent>,
	React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>
>(({ className, ...props }, ref) => (
	<DropdownMenuPrimitive.SubContent
		ref={ref}
		className={cn(
			"pktw-z-50 pktw-min-w-[8rem] pktw-overflow-hidden pktw-rounded-md pktw-border pktw-bg-popover pktw-p-1 pktw-text-popover-foreground pktw-shadow-lg data-[state=open]:pktw-animate-in data-[state=closed]:pktw-animate-out data-[state=closed]:pktw-fade-out-0 data-[state=open]:pktw-fade-in-0 data-[state=closed]:pktw-zoom-out-95 data-[state=open]:pktw-zoom-in-95 data-[side=bottom]:pktw-slide-in-from-top-2 data-[side=left]:pktw-slide-in-from-right-2 data-[side=right]:pktw-slide-in-from-left-2 data-[side=top]:pktw-slide-in-from-bottom-2",
			className
		)}
		{...props}
	/>
));
DropdownMenuSubContent.displayName = DropdownMenuPrimitive.SubContent.displayName;

const DropdownMenuContent = React.forwardRef<
	React.ElementRef<typeof DropdownMenuPrimitive.Content>,
	React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
	<DropdownMenuPrimitive.Portal>
		<DropdownMenuPrimitive.Content
			ref={ref}
			sideOffset={sideOffset}
			className={cn(
				"pktw-z-50 pktw-min-w-[8rem] pktw-overflow-hidden pktw-rounded-md pktw-border pktw-bg-popover pktw-p-1 pktw-text-popover-foreground pktw-shadow-md data-[state=open]:pktw-animate-in data-[state=closed]:pktw-animate-out data-[state=closed]:pktw-fade-out-0 data-[state=open]:pktw-fade-in-0 data-[state=closed]:pktw-zoom-out-95 data-[state=open]:pktw-zoom-in-95 data-[side=bottom]:pktw-slide-in-from-top-2 data-[side=left]:pktw-slide-in-from-right-2 data-[side=right]:pktw-slide-in-from-left-2 data-[side=top]:pktw-slide-in-from-bottom-2",
				className
			)}
			{...props}
		/>
	</DropdownMenuPrimitive.Portal>
));
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;

const DropdownMenuItem = React.forwardRef<
	React.ElementRef<typeof DropdownMenuPrimitive.Item>,
	React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
		inset?: boolean;
	}
>(({ className, inset, ...props }, ref) => (
	<DropdownMenuPrimitive.Item
		ref={ref}
		className={cn(
			"pktw-relative pktw-flex pktw-cursor-default pktw-select-none pktw-items-center pktw-rounded-sm pktw-px-2 pktw-py-1.5 pktw-text-sm pktw-outline-none pktw-transition-colors focus:pktw-bg-accent focus:pktw-text-accent-foreground data-[disabled]:pktw-pointer-events-none data-[disabled]:pktw-opacity-50",
			inset && "pktw-pl-8",
			className
		)}
		{...props}
	/>
));
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;

const DropdownMenuCheckboxItem = React.forwardRef<
	React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
	React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
	<DropdownMenuPrimitive.CheckboxItem
		ref={ref}
		className={cn(
			"pktw-relative pktw-flex pktw-cursor-default pktw-select-none pktw-items-center pktw-rounded-sm pktw-py-1.5 pktw-pl-8 pktw-pr-2 pktw-text-sm pktw-outline-none pktw-transition-colors focus:pktw-bg-accent focus:pktw-text-accent-foreground data-[disabled]:pktw-pointer-events-none data-[disabled]:pktw-opacity-50",
			className
		)}
		checked={checked}
		{...props}
	>
		<span className="pktw-absolute pktw-left-2 pktw-flex pktw-h-3.5 pktw-w-3.5 pktw-items-center pktw-justify-center">
			<DropdownMenuPrimitive.ItemIndicator>
				<Check className="pktw-h-4 pktw-w-4" />
			</DropdownMenuPrimitive.ItemIndicator>
		</span>
		{children}
	</DropdownMenuPrimitive.CheckboxItem>
));
DropdownMenuCheckboxItem.displayName =
	DropdownMenuPrimitive.CheckboxItem.displayName;

const DropdownMenuRadioItem = React.forwardRef<
	React.ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
	React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
	<DropdownMenuPrimitive.RadioItem
		ref={ref}
		className={cn(
			"pktw-relative pktw-flex pktw-cursor-default pktw-select-none pktw-items-center pktw-rounded-sm pktw-py-1.5 pktw-pl-8 pktw-pr-2 pktw-text-sm pktw-outline-none pktw-transition-colors focus:pktw-bg-accent focus:pktw-text-accent-foreground data-[disabled]:pktw-pointer-events-none data-[disabled]:pktw-opacity-50",
			className
		)}
		{...props}
	>
		<span className="pktw-absolute pktw-left-2 pktw-flex pktw-h-3.5 pktw-w-3.5 pktw-items-center pktw-justify-center">
			<DropdownMenuPrimitive.ItemIndicator>
				<Circle className="pktw-h-2 pktw-w-2 pktw-fill-current" />
			</DropdownMenuPrimitive.ItemIndicator>
		</span>
		{children}
	</DropdownMenuPrimitive.RadioItem>
));
DropdownMenuRadioItem.displayName = DropdownMenuPrimitive.RadioItem.displayName;

const DropdownMenuLabel = React.forwardRef<
	React.ElementRef<typeof DropdownMenuPrimitive.Label>,
	React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & {
		inset?: boolean;
	}
>(({ className, inset, ...props }, ref) => (
	<DropdownMenuPrimitive.Label
		ref={ref}
		className={cn(
			"pktw-px-2 pktw-py-1.5 pktw-text-sm pktw-font-semibold",
			inset && "pktw-pl-8",
			className
		)}
		{...props}
	/>
));
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName;

const DropdownMenuSeparator = React.forwardRef<
	React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
	React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
	<DropdownMenuPrimitive.Separator
		ref={ref}
		className={cn("pktw--mx-1 pktw-my-1 pktw-h-px pktw-bg-muted", className)}
		{...props}
	/>
));
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName;

const DropdownMenuShortcut = ({
	className,
	...props
}: React.HTMLAttributes<HTMLSpanElement>) => {
	return (
		<span
			className={cn("pktw-ml-auto pktw-text-xs pktw-tracking-widest pktw-opacity-60", className)}
			{...props}
		/>
	);
};
DropdownMenuShortcut.displayName = "DropdownMenuShortcut";

export {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuCheckboxItem,
	DropdownMenuRadioItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuGroup,
	DropdownMenuPortal,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuRadioGroup,
};

