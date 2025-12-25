

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/ui/component/shared-ui/collapsible";
import { cn } from "@/ui/react/lib/utils";
import { BookIcon, ChevronDownIcon } from "lucide-react";
import type { ComponentProps } from "react";

export type SourcesProps = ComponentProps<"div">;

export const Sources = ({ className, ...props }: SourcesProps) => (
  <Collapsible
    className={cn("not-prose mb-4 pktw-text-primary pktw-text-xs", className)}
    {...props}
  />
);

export type SourcesTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  count: number;
};

export const SourcesTrigger = ({
  className,
  count,
  children,
  ...props
}: SourcesTriggerProps) => (
  <CollapsibleTrigger
    className={cn("pktw-flex pktw-items-center pktw-gap-2", className)}
    {...props}
  >
    {children ?? (
      <>
        <p className="pktw-font-medium">Used {count} sources</p>
        <ChevronDownIcon className="pktw-h-4 pktw-w-4" />
      </>
    )}
  </CollapsibleTrigger>
);

export type SourcesContentProps = ComponentProps<typeof CollapsibleContent>;

export const SourcesContent = ({
  className,
  ...props
}: SourcesContentProps) => (
  <CollapsibleContent
    className={cn(
      "mt-3 pktw-flex pktw-w-fit pktw-flex-col pktw-gap-2",
      "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
      className
    )}
    {...props}
  />
);

export type SourceProps = ComponentProps<"a">;

export const Source = ({ href, title, children, ...props }: SourceProps) => (
  <a
    className="pktw-flex pktw-items-center pktw-gap-2"
    href={href}
    rel="noreferrer"
    target="_blank"
    {...props}
  >
    {children ?? (
      <>
        <BookIcon className="pktw-h-4 pktw-w-4" />
        <span className="pktw-block pktw-font-medium">{title}</span>
      </>
    )}
  </a>
);
