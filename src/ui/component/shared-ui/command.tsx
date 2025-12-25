import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";
import { Dialog, DialogContent } from "@/ui/component/shared-ui/dialog";
import { cn } from "@/ui/react/lib/utils";

const Command = React.forwardRef<
	React.ElementRef<typeof CommandPrimitive>,
	React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
	<CommandPrimitive
		ref={ref}
		className={cn(
			"pktw-flex pktw-h-full pktw-w-full pktw-flex-col pktw-overflow-hidden pktw-rounded-md pktw-bg-popover pktw-text-popover-foreground",
			className
		)}
		{...props}
	/>
));
Command.displayName = CommandPrimitive.displayName;

const CommandDialog = ({ children, ...props }: React.ComponentProps<typeof Dialog>) => {
	return (
		<Dialog {...props}>
			<DialogContent className="pktw-overflow-hidden pktw-p-0">
				<Command className="[&_[cmdk-group-heading]]:pktw-px-2 [&_[cmdk-group-heading]]:pktw-font-medium [&_[cmdk-group-heading]]:pktw-text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pktw-pt-0 [&_[cmdk-group]]:pktw-px-2 [&_[cmdk-input-wrapper]_svg]:pktw-h-4 [&_[cmdk-input-wrapper]_svg]:pktw-w-4 [&_[cmdk-input]]:pktw-h-12 [&_[cmdk-item]]:pktw-px-2 [&_[cmdk-item]]:pktw-py-3 [&_[cmdk-item]_svg]:pktw-h-4 [&_[cmdk-item]_svg]:pktw-w-4">
					{children}
				</Command>
			</DialogContent>
		</Dialog>
	);
};

const CommandInput = React.forwardRef<
	React.ElementRef<typeof CommandPrimitive.Input>,
	React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className, ...props }, ref) => (
	<div className="pktw-flex pktw-items-center pktw-border-b pktw-px-3" cmdk-input-wrapper="">
		<CommandPrimitive.Input
			ref={ref}
			className={cn(
				"pktw-flex pktw-h-11 pktw-w-full pktw-rounded-md pktw-bg-transparent pktw-py-3 pktw-text-sm pktw-outline-none placeholder:pktw-text-muted-foreground disabled:pktw-cursor-not-allowed disabled:pktw-opacity-50",
				className
			)}
			{...props}
		/>
	</div>
));

CommandInput.displayName = CommandPrimitive.Input.displayName;

const CommandList = React.forwardRef<
	React.ElementRef<typeof CommandPrimitive.List>,
	React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
	<CommandPrimitive.List
		ref={ref}
		className={cn("pktw-max-h-[300px] pktw-overflow-y-auto pktw-overflow-x-hidden", className)}
		{...props}
	/>
));

CommandList.displayName = CommandPrimitive.List.displayName;

const CommandEmpty = React.forwardRef<
	React.ElementRef<typeof CommandPrimitive.Empty>,
	React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>((props, ref) => (
	<CommandPrimitive.Empty
		ref={ref}
		className="pktw-py-6 pktw-text-center pktw-text-sm"
		{...props}
	/>
));

CommandEmpty.displayName = CommandPrimitive.Empty.displayName;

const CommandGroup = React.forwardRef<
	React.ElementRef<typeof CommandPrimitive.Group>,
	React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
	<CommandPrimitive.Group
		ref={ref}
		className={cn(
			"pktw-overflow-hidden pktw-p-1 pktw-text-foreground [&_[cmdk-group-heading]]:pktw-px-2 [&_[cmdk-group-heading]]:pktw-py-1.5 [&_[cmdk-group-heading]]:pktw-text-xs [&_[cmdk-group-heading]]:pktw-font-medium [&_[cmdk-group-heading]]:pktw-text-muted-foreground",
			className
		)}
		{...props}
	/>
));

CommandGroup.displayName = CommandPrimitive.Group.displayName;

const CommandSeparator = React.forwardRef<
	React.ElementRef<typeof CommandPrimitive.Separator>,
	React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(({ className, ...props }, ref) => (
	<CommandPrimitive.Separator
		ref={ref}
		className={cn("pktw--mx-1 pktw-h-px pktw-bg-border", className)}
		{...props}
	/>
));
CommandSeparator.displayName = CommandPrimitive.Separator.displayName;

const CommandItem = React.forwardRef<
	React.ElementRef<typeof CommandPrimitive.Item>,
	React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
	<CommandPrimitive.Item
		ref={ref}
		className={cn(
			"pktw-relative pktw-flex pktw-cursor-default pktw-select-none pktw-items-center pktw-rounded-sm pktw-px-2 pktw-py-1.5 pktw-text-sm pktw-outline-none aria-selected:pktw-bg-accent aria-selected:pktw-text-accent-foreground data-[disabled]:pktw-pointer-events-none data-[disabled]:pktw-opacity-50",
			className
		)}
		{...props}
	/>
));

CommandItem.displayName = CommandPrimitive.Item.displayName;

const CommandShortcut = ({
	className,
	...props
}: React.HTMLAttributes<HTMLSpanElement>) => {
	return (
		<span
			className={cn(
				"pktw-ml-auto pktw-text-xs pktw-tracking-widest pktw-text-muted-foreground",
				className
			)}
			{...props}
		/>
	);
};
CommandShortcut.displayName = "CommandShortcut";

export {
	Command,
	CommandDialog,
	CommandInput,
	CommandList,
	CommandEmpty,
	CommandGroup,
	CommandItem,
	CommandShortcut,
	CommandSeparator,
};

