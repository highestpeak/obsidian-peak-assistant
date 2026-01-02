"use client";

import { useControllableState } from "@radix-ui/react-use-controllable-state";
import { Badge } from "@/ui/component/shared-ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/ui/component/shared-ui/collapsible";
import { cn } from "@/ui/react/lib/utils";
import {
  BrainIcon,
  ChevronDownIcon,
  DotIcon,
  type LucideIcon,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { createContext, memo, useContext, useMemo } from "react";

type ChainOfThoughtContextValue = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
};

const ChainOfThoughtContext = createContext<ChainOfThoughtContextValue | null>(
  null
);

const useChainOfThought = () => {
  const context = useContext(ChainOfThoughtContext);
  if (!context) {
    throw new Error(
      "ChainOfThought components must be used within ChainOfThought"
    );
  }
  return context;
};

export type ChainOfThoughtProps = ComponentProps<"div"> & {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export const ChainOfThought = memo(
  ({
    className,
    open,
    defaultOpen = false,
    onOpenChange,
    children,
    ...props
  }: ChainOfThoughtProps) => {
    const [isOpen, setIsOpen] = useControllableState({
      prop: open,
      defaultProp: defaultOpen,
      onChange: onOpenChange,
    });

    const chainOfThoughtContext = useMemo(
      () => ({ isOpen, setIsOpen }),
      [isOpen, setIsOpen]
    );

    return (
      <ChainOfThoughtContext.Provider value={chainOfThoughtContext}>
        <div
          className={cn("pktw-not-prose pktw-max-w-prose pktw-space-y-4", className)}
          {...props}
        >
          {children}
        </div>
      </ChainOfThoughtContext.Provider>
    );
  }
);

export type ChainOfThoughtHeaderProps = ComponentProps<
  typeof CollapsibleTrigger
>;

export const ChainOfThoughtHeader = memo(
  ({ className, children, ...props }: ChainOfThoughtHeaderProps) => {
    const { isOpen, setIsOpen } = useChainOfThought();

    return (
      <Collapsible onOpenChange={setIsOpen} open={isOpen}>
        <CollapsibleTrigger
          className={cn(
            "pktw-flex pktw-w-full pktw-items-center pktw-gap-2 pktw-text-muted-foreground pktw-text-sm pktw-transition-colors hover:pktw-text-foreground",
            className
          )}
          {...props}
        >
          <BrainIcon className="pktw-size-4" />
          <span className="pktw-flex-1 pktw-text-left">
            {children ?? "Chain of Thought"}
          </span>
          <ChevronDownIcon
            className={cn(
              "pktw-size-4 pktw-transition-transform",
              isOpen ? "pktw-rotate-180" : "pktw-rotate-0"
            )}
          />
        </CollapsibleTrigger>
      </Collapsible>
    );
  }
);

export type ChainOfThoughtStepProps = ComponentProps<"div"> & {
  icon?: LucideIcon;
  label: ReactNode;
  description?: ReactNode;
  status?: "complete" | "active" | "pending";
};

export const ChainOfThoughtStep = memo(
  ({
    className,
    icon: Icon = DotIcon,
    label,
    description,
    status = "complete",
    children,
    ...props
  }: ChainOfThoughtStepProps) => {
    const statusStyles = {
      complete: "text-muted-foreground",
      active: "text-foreground",
      pending: "text-muted-foreground/50",
    };

    return (
      <div
        className={cn(
          "pktw-flex pktw-gap-2 pktw-text-sm",
          statusStyles[status],
          "pktw-fade-in-0 pktw-slide-in-from-top-2 pktw-animate-in",
          className
        )}
        {...props}
      >
        <div className="pktw-relative pktw-mt-0.5">
          <Icon className="pktw-size-4" />
          <div className="pktw--mx-px pktw-absolute pktw-top-7 pktw-bottom-0 pktw-left-1/2 pktw-w-px pktw-bg-border" />
        </div>
        <div className="pktw-flex-1 pktw-space-y-2 pktw-overflow-hidden">
          <div>{label}</div>
          {description && (
            <div className="pktw-text-muted-foreground pktw-text-xs">{description}</div>
          )}
          {children}
        </div>
      </div>
    );
  }
);

export type ChainOfThoughtSearchResultsProps = ComponentProps<"div">;

export const ChainOfThoughtSearchResults = memo(
  ({ className, ...props }: ChainOfThoughtSearchResultsProps) => (
    <div
      className={cn("pktw-flex pktw-flex-wrap pktw-items-center pktw-gap-2", className)}
      {...props}
    />
  )
);

export type ChainOfThoughtSearchResultProps = ComponentProps<typeof Badge>;

export const ChainOfThoughtSearchResult = memo(
  ({ className, children, ...props }: ChainOfThoughtSearchResultProps) => (
    <Badge
      className={cn("pktw-gap-1 pktw-px-2 pktw-py-0.5 pktw-font-normal pktw-text-xs", className)}
      variant="secondary"
      {...props}
    >
      {children}
    </Badge>
  )
);

export type ChainOfThoughtContentProps = ComponentProps<
  typeof CollapsibleContent
>;

export const ChainOfThoughtContent = memo(
  ({ className, children, ...props }: ChainOfThoughtContentProps) => {
    const { isOpen } = useChainOfThought();

    return (
      <Collapsible open={isOpen}>
        <CollapsibleContent
          className={cn(
            "pktw-mt-2 pktw-space-y-3",
            "data-[state=closed]:pktw-fade-out-0 data-[state=closed]:pktw-slide-out-to-top-2 data-[state=open]:pktw-slide-in-from-top-2 pktw-text-popover-foreground pktw-outline-none data-[state=closed]:pktw-animate-out data-[state=open]:pktw-animate-in",
            className
          )}
          {...props}
        >
          {children}
        </CollapsibleContent>
      </Collapsible>
    );
  }
);

export type ChainOfThoughtImageProps = ComponentProps<"div"> & {
  caption?: string;
};

export const ChainOfThoughtImage = memo(
  ({ className, children, caption, ...props }: ChainOfThoughtImageProps) => (
    <div className={cn("pktw-mt-2 pktw-space-y-2", className)} {...props}>
      <div className="pktw-relative pktw-flex pktw-max-h-[22rem] pktw-items-center pktw-justify-center pktw-overflow-hidden pktw-rounded-lg pktw-bg-muted pktw-p-3">
        {children}
      </div>
      {caption && <p className="pktw-text-muted-foreground pktw-text-xs">{caption}</p>}
    </div>
  )
);

ChainOfThought.displayName = "ChainOfThought";
ChainOfThoughtHeader.displayName = "ChainOfThoughtHeader";
ChainOfThoughtStep.displayName = "ChainOfThoughtStep";
ChainOfThoughtSearchResults.displayName = "ChainOfThoughtSearchResults";
ChainOfThoughtSearchResult.displayName = "ChainOfThoughtSearchResult";
ChainOfThoughtContent.displayName = "ChainOfThoughtContent";
ChainOfThoughtImage.displayName = "ChainOfThoughtImage";
