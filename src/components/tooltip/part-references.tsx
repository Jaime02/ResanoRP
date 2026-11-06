import { ButtonCopyLayout } from "@/components/ui/button-copy";
import { InfoPopoverTrigger } from "@/components/ui/info-popover";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CLIENT_LABEL, REFERENCE_LABEL } from "@/messages/common";
import { CLIENT_DESCRIPTION_LABEL } from "@/messages/part";

interface TooltipPartReferencesProps {
  references: Array<{
    id: number;
    reference: string;
    clientDescription: string;
    client?: { name: string } | null;
  }>;
}

export default function TooltipPartReferences({ references }: TooltipPartReferencesProps) {
  if (references.length === 0) {
    return null;
  }

  return (
    <Popover>
      <InfoPopoverTrigger data-testid="tooltip-part-references" />
      <PopoverContent>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>{CLIENT_LABEL}</TableHeader>
              <TableHeader>{REFERENCE_LABEL}</TableHeader>
              <TableHeader>{CLIENT_DESCRIPTION_LABEL}</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {references.map((reference) => (
              <TableRow key={reference.id}>
                <TableCell>{reference.client?.name}</TableCell>
                <TableCell>
                  <ButtonCopyLayout value={reference.reference}>{reference.reference}</ButtonCopyLayout>
                </TableCell>
                <TableCell>{reference.clientDescription}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </PopoverContent>
    </Popover>
  );
}
