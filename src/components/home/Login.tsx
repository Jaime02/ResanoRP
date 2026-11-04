import { useLocation, useNavigate } from "@tanstack/react-router";
import { ArrowLeftIcon, FactoryIcon, LogInIcon, ShieldUserIcon, UserIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { z } from "zod";

import ResanoLogo from "@/components/images/ResanoLogo";
import { Button } from "@/components/ui/button";
import { Card, CardFooter, CardTitle } from "@/components/ui/card";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { UserMode, useAppContext } from "@/contexts/app-context";
import { FormContextProvider, useAppForm } from "@/form";
import { loginAdminFn } from "@/lib/admin-session-fns";
import clientLog from "@/logging/clientLog";
import { LoggerLevels } from "@/logging/types";
import { NO_MACHINES_MESSAGE } from "@/messages/combobox";
import { BACK_LABEL } from "@/messages/common";
import {
  ADMIN_ACCESS_TITLE,
  ENTER_PASSWORD_LABEL,
  LOGIN_LABEL,
  SELECT_MACHINE_TITLE,
  SELECT_USER_TYPE_TITLE,
  WRONG_PASSWORD_MESSAGE,
} from "@/messages/home";
import { useQueryMachines } from "@/queries/machine";

const userModeIcons: Record<UserMode, ReactNode> = {
  [UserMode.Machine]: <FactoryIcon />,
  [UserMode.User]: <UserIcon />,
  [UserMode.Admin]: <ShieldUserIcon />,
};

const adminPasswordSchema = z.object({ password: z.string().min(1) });

function MachineSelection() {
  const { setUserModeMachine } = useAppContext();
  const { data: machines, isLoading } = useQueryMachines();

  if (isLoading) {
    return <LoadingSpinner className="size-16" />;
  }

  return (
    <Card data-testid="form-machine-selection">
      <CardTitle>{SELECT_MACHINE_TITLE}</CardTitle>
      {machines.length === 0 ? (
        <span>{NO_MACHINES_MESSAGE}</span>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {machines.map((machine) => (
            <Button key={machine.id} className="justify-center" onClick={() => setUserModeMachine(machine)}>
              {machine.name}
            </Button>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function Login({ children }: { children: ReactNode }) {
  const { toaster, userMode, setUserMode, userModeMachine, isLoadingUserModeMachine, isDocumentHydrated } =
    useAppContext();

  const navigate = useNavigate();
  const location = useLocation();

  const [isAdminLogin, setIsAdminLogin] = useState(false);

  const formAdminPassword = useAppForm({
    formId: "adminPassword",
    defaultValues: {
      password: "",
    },
    validators: {
      onChange: adminPasswordSchema,
    },
    onSubmit: async ({ value }) => {
      if (await loginAdminFn({ data: value.password })) {
        formAdminPassword.reset();
        setUserMode(UserMode.Admin);
        setIsAdminLogin(false);
      } else {
        toaster.error({ title: WRONG_PASSWORD_MESSAGE });
        await clientLog(
          LoggerLevels.emerg,
          "Intento de acceso con contraseña incorrecta para cambiar el modo de usuario",
        );
      }
    },
  });

  useEffect(() => {
    if (isDocumentHydrated && userMode === undefined && location.pathname !== "/") {
      void navigate({ to: "/" });
    }
  }, [userMode, navigate, isDocumentHydrated, location.pathname]);

  if (userMode !== undefined && (userMode !== UserMode.Machine || userModeMachine !== undefined)) {
    return <>{children}</>;
  }

  let content: ReactNode;
  if (userMode === UserMode.Machine) {
    content = isLoadingUserModeMachine ? <LoadingSpinner className="size-16" /> : <MachineSelection />;
  } else if (isAdminLogin) {
    content = (
      <Card data-testid="form-admin-password">
        <CardTitle>{ADMIN_ACCESS_TITLE}</CardTitle>
        <FormContextProvider form={formAdminPassword} validationSchema={adminPasswordSchema} className="w-full">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void formAdminPassword.handleSubmit();
            }}
            className="flex flex-col gap-4"
          >
            <input type="text" name="username" autoComplete="username" hidden />
            <formAdminPassword.AppField
              name="password"
              children={(field) => (
                <field.TextInput
                  id="admin-password"
                  label={ENTER_PASSWORD_LABEL}
                  type="password"
                  autoComplete="current-password"
                  autoFocus
                />
              )}
            />
            <CardFooter className="justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  formAdminPassword.reset();
                  setIsAdminLogin(false);
                }}
              >
                <ArrowLeftIcon />
                {BACK_LABEL}
              </Button>
              <formAdminPassword.ButtonSubmit customText={LOGIN_LABEL} icon={<LogInIcon />} />
            </CardFooter>
          </form>
        </FormContextProvider>
      </Card>
    );
  } else {
    content = (
      <Card data-testid="form-login">
        <CardTitle>{SELECT_USER_TYPE_TITLE}</CardTitle>
        {Object.values(UserMode).map((mode) => (
          <Button
            key={mode}
            className="justify-center"
            onClick={() => (mode === UserMode.Admin ? setIsAdminLogin(true) : setUserMode(mode))}
          >
            {userModeIcons[mode]}
            {mode}
          </Button>
        ))}
      </Card>
    );
  }

  return (
    <div className="grid grow grid-rows-[minmax(0,1fr)_minmax(0,3fr)] justify-items-center gap-10">
      <ResanoLogo className="size-full max-w-xl" />
      <div className="flex w-full items-start justify-center">{content}</div>
    </div>
  );
}
