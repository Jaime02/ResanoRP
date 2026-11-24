import { useDbClient } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useMemo } from "react";

import userCollection from "@/collections/user";
import CreateEditUserDialog from "@/components/dialog/create-edit-user";
import type { PublicBaseTableProps } from "@/components/table/base-table";
import BaseTable from "@/components/table/base-table";
import { createTableColumnHelper } from "@/components/table/column-helper";
import ButtonLink from "@/components/ui/button-link";
import { ModelActions } from "@/components/ui/model-actions";
import { useAppContext } from "@/contexts/app-context";
import { serializeUser } from "@/lib/serializers";
import {
  IP_LABEL,
  USER_CREATE_TITLE,
  USER_DELETE_MESSAGE,
  USER_DELETE_TITLE,
  USER_DELETED_MESSAGE,
} from "@/messages/backoffice";
import { ACTIONS_LABEL, NAME_LABEL } from "@/messages/common";
import { useQueryUsers } from "@/queries/user";
import type { TTableUserState } from "@/schemas/user";
import { CellDataType } from "@/types";

type TUser = ReturnType<typeof useQueryUsers>["data"][number];

interface TableUserProps extends PublicBaseTableProps<TUser, TTableUserState> {
  editUserId?: number;
  createUser?: boolean;
}

const columnHelper = createTableColumnHelper<TUser>();

export default function TableUser({ editUserId, createUser, ...props }: TableUserProps) {
  const navigate = useNavigate();
  const dbClient = useDbClient();
  const { showToastOnTransaction } = useAppContext();

  const { data: users, isLoading: isLoadingUsers } = useQueryUsers(props.state?.filters);

  const columns = useMemo(
    () => [
      columnHelper.accessor("name", {
        enableColumnFilter: true,
        header: NAME_LABEL,
        id: "name",
        meta: { dataType: CellDataType.String },
      }),
      columnHelper.accessor("ip", {
        enableColumnFilter: true,
        header: IP_LABEL,
        id: "ip",
        meta: { dataType: CellDataType.String },
      }),
      columnHelper.display({
        cell: ({ row }) => (
          <ModelActions
            disabled={props.isLoading === true || isLoadingUsers}
            onEdit={() =>
              void navigate({
                search: (prev) => ({ ...prev, editUserId: row.original.id }),
                to: ".",
              })
            }
            deleteButton={{
              dialogTitle: USER_DELETE_TITLE,
              dialogDescription: USER_DELETE_MESSAGE,
              serializedModel: serializeUser(row.original),
              onConfirm: () =>
                void showToastOnTransaction({
                  transaction: () =>
                    dbClient.collection(userCollection).delete(row.original.id, {
                      optimistic: import.meta.env.VITE_ENV_NAME !== "test",
                    }),
                  onSuccess: { title: USER_DELETED_MESSAGE },
                }),
            }}
          />
        ),
        header: ACTIONS_LABEL,
        id: "actions",
      }),
    ],
    [props.isLoading, isLoadingUsers, navigate, dbClient, showToastOnTransaction],
  );

  return (
    <>
      <BaseTable
        testId="table-user"
        columns={columns}
        rows={users}
        isLoading={props.isLoading === true || isLoadingUsers}
        headerExtraComponents={
          <ButtonLink variant="success" to="." search={(prev) => ({ ...prev, createUser: true })}>
            <PlusIcon /> {USER_CREATE_TITLE}
          </ButtonLink>
        }
        {...props}
      />
      <CreateEditUserDialog createUser={createUser} editUserId={editUserId} />
    </>
  );
}
