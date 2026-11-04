import { TableCell, TableRow } from "@/components/ui/table";

interface NoDataRowProps {
  columns: number;
  message: React.ReactNode;
}
export default function NoDataRow({ columns, message }: NoDataRowProps) {
  return (
    <TableRow testId="tr-no-data">
      <TableCell colSpan={columns}>
        <div className="text-center text-red-500">{message}</div>
      </TableCell>
    </TableRow>
  );
}
