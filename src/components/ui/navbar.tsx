import { ClientOnly, useCanGoBack, useLocation, useMatches, useRouter } from "@tanstack/react-router";
import { ArrowLeftIcon, HomeIcon, LogOutIcon } from "lucide-react";

import Logo from "@/components/images/ResanoLogo";
import { Button } from "@/components/ui/button";
import ButtonLink from "@/components/ui/button-link";
import Header from "@/components/ui/header";
import { UserMode, useAppContext } from "@/contexts/app-context";
import { UNKNOWN_MACHINE_LABEL } from "@/messages/common";

const DEFAULT_TITLE = "ResanoRP";

export default function Navbar() {
  const { userMode, userModeMachine, resetUserState } = useAppContext();
  const router = useRouter();
  const canGoBack = useCanGoBack();

  const matches = useMatches();
  const title = [...matches].reverse().find((m) => m.context.title !== undefined)?.context.title ?? DEFAULT_TITLE;
  const location = useLocation();
  const renderBackButton = (disabled: boolean) => (
    <ButtonLink
      onClick={() => {
        router.history.back();
      }}
      variant="secondary"
      size="icon"
      showExternalLinkIcon={false}
      disabled={disabled}
    >
      <ArrowLeftIcon color="white" className="size-8" />
    </ButtonLink>
  );
  return (
    <div className="flex items-center gap-4 bg-black px-3 py-2">
      <ButtonLink
        to="/"
        variant="secondary"
        size="icon"
        showExternalLinkIcon={false}
        disabled={location.pathname === "/"}
      >
        <HomeIcon color="white" className="size-8" />
      </ButtonLink>
      <ClientOnly fallback={renderBackButton(false)}>{renderBackButton(!canGoBack)}</ClientOnly>
      <div className="max-w-24 md:max-w-34">
        <Logo className="h-full w-full" />
      </div>
      <Header className="text-2xl text-white lg:text-3xl">{title}</Header>
      <div className="ml-auto flex flex-row items-center gap-3">
        <span data-testid="span-current-user-mode" className="text-white">
          {userMode !== UserMode.Machine
            ? userMode
            : userModeMachine
              ? ` ${userModeMachine.name}`
              : UNKNOWN_MACHINE_LABEL}
        </span>
        {userMode !== undefined && (
          <Button testId="button-logout" variant="destructive" size="icon" onClick={resetUserState}>
            <LogOutIcon />
          </Button>
        )}
      </div>
    </div>
  );
}
