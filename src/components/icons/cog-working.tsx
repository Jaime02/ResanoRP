import { CogIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export default function CogWorking(props: React.ComponentProps<typeof CogIcon>) {
  return <CogIcon className={cn(props.className, "animate-spin duration-1000")} />;
}
