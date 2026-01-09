"use client";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/ui/component/shared-ui/collapsible";
import { cn } from "@/ui/react/lib/utils";
import { ChevronDownIcon, SearchIcon } from "lucide-react";
import type { ComponentProps } from "react";

export type TaskItemFileProps = ComponentProps<"div">;

export const TaskItemFile = ({
  children,
  className,
  ...props
}: TaskItemFileProps) => (
  <div
    className={cn(
      "pktw-inline-flex pktw-items-center pktw-gap-1 pktw-rounded-md pktw-border pktw-bg-secondary pktw-px-1.5 pktw-py-0.5 pktw-text-foreground pktw-text-xs",
      className
    )}
    {...props}
  >
    {children}
  </div>
);

export type TaskItemProps = ComponentProps<"div">;

export const TaskItem = ({ children, className, ...props }: TaskItemProps) => (
  <div className={cn("pktw-text-muted-foreground pktw-text-sm", className)} {...props}>
    {children}
  </div>
);

export type TaskProps = ComponentProps<typeof Collapsible>;

export const Task = ({
  defaultOpen = true,
  className,
  ...props
}: TaskProps) => (
  <Collapsible className={cn(className)} defaultOpen={defaultOpen} {...props} />
);

export type TaskTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  title: string;
};

export const TaskTrigger = ({
  children,
  className,
  title,
  ...props
}: TaskTriggerProps) => (
  <CollapsibleTrigger asChild className={cn("pktw-group", className)} {...props}>
    {children ?? (
      <div className="pktw-flex pktw-w-full pktw-cursor-pointer pktw-items-center pktw-gap-2 pktw-text-muted-foreground pktw-text-sm pktw-transition-colors hover:pktw-text-foreground">
        <SearchIcon className="pktw-size-4" />
        <p className="pktw-text-sm">{title}</p>
        <ChevronDownIcon className="pktw-size-4 pktw-transition-transform group-data-[state=open]:pktw-rotate-180" />
      </div>
    )}
  </CollapsibleTrigger>
);

export type TaskContentProps = ComponentProps<typeof CollapsibleContent>;

export const TaskContent = ({
  children,
  className,
  ...props
}: TaskContentProps) => (
  <CollapsibleContent
    className={cn(
      "data-[state=closed]:pktw-fade-out-0 data-[state=closed]:pktw-slide-out-to-top-2 data-[state=open]:pktw-slide-in-from-top-2 pktw-text-popover-foreground pktw-outline-none data-[state=closed]:pktw-animate-out data-[state=open]:pktw-animate-in",
      className
    )}
    {...props}
  >
    <div className="pktw-mt-4 pktw-space-y-2 pktw-border-muted pktw-border-l-2 pktw-pl-4">
      {children}
    </div>
  </CollapsibleContent>
);
