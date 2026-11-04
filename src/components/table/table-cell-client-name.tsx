import ButtonLink from "@/components/ui/button-link";
import { useAppContext } from "@/contexts/app-context";

export function TableCellClientName({ client }: { client?: { id: number; name: string } | null }) {
  const { isAdmin } = useAppContext();
  if (!client) return null;
  if (!isAdmin) return client.name;
  return (
    <ButtonLink to="/client/$id" params={{ id: client.id }} target="_blank">
      {client.name}
    </ButtonLink>
  );
}
