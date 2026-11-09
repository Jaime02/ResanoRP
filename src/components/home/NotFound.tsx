import { HomeIcon } from "lucide-react";

import ButtonLink from "@/components/ui/button-link";
import { Separator } from "@/components/ui/separator";
import log from "@/logging/log";
import { LogMessages, LoggerLevels } from "@/logging/types";
import { GO_HOME_LABEL } from "@/messages/common";

export default function NotFound() {
  void log(LoggerLevels.warning, LogMessages.notFoundRendered);
  return (
    <div className="flex flex-col gap-2">
      Error! Página no encontrada :(
      <Separator />
      <ButtonLink to="/">
        <HomeIcon /> {GO_HOME_LABEL}
      </ButtonLink>
    </div>
  );
}
