import { HomeIcon } from "lucide-react";

import ButtonLink from "@/components/ui/button-link";
import log from "@/logging/log";
import { LogMessages, LoggerLevels } from "@/logging/types";
import { GO_HOME_LABEL, NOT_FOUND_TITLE } from "@/messages/common";

export default function NotFound() {
  void log(LoggerLevels.warning, LogMessages.notFoundRendered);
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <span className="text-4xl font-bold text-muted-foreground/80">404</span>
      <h1 className="text-4xl font-semibold">{NOT_FOUND_TITLE}</h1>
      <ButtonLink to="/" className="mt-2">
        <HomeIcon /> {GO_HOME_LABEL}
      </ButtonLink>
    </div>
  );
}
