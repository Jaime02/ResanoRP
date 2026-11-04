import type { ComboboxModelProps } from "@/components/combobox/model";
import ComboboxModel from "@/components/combobox/model";
import { NO_CLIENTS_MESSAGE, SELECT_CLIENT_PLACEHOLDER } from "@/messages/combobox";
import { useQueryClientById, useQueryClients } from "@/queries/client";
import type { BaseClient } from "@/types/client";

export default function ComboboxClient(props: ComboboxModelProps<BaseClient>) {
  // Looked up apart from the options, which leave deleted Clientes out, so the history that points to one still shows it
  const { data: activeClient } = useQueryClientById(props.activeItemId);

  return (
    <ComboboxModel
      modelName="Clients"
      useQueryItems={useQueryClients}
      activeItem={activeClient ?? null}
      placeholder={SELECT_CLIENT_PLACEHOLDER}
      noItemsMessage={NO_CLIENTS_MESSAGE}
      {...props}
    />
  );
}
