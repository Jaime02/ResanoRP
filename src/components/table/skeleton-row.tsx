import ButtonExpanderColumn from "@/components/table/button-expander-column";
import { RadioButton } from "@/components/ui/radio";
import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";

interface SkeletonRowProps {
  columns: number;
  hasExpanderColumn?: boolean;
  hasRadioColumn?: boolean;
}

export default function SkeletonRow({ columns, hasExpanderColumn = false, hasRadioColumn = false }: SkeletonRowProps) {
  return (
    <TableRow testId="tr-skeleton">
      {Array.from({ length: columns }).map((_, colIndex) => {
        const isRadioCol = hasRadioColumn && colIndex === 0;
        const isExpanderCol = hasExpanderColumn && (hasRadioColumn ? colIndex === 1 : colIndex === 0);
        return (
          <TableCell key={colIndex} style={{ width: `var(--col-${colIndex}-size)` }}>
            {isRadioCol ? (
              <RadioButton testId="button-radio-column" value={null} disabled />
            ) : isExpanderCol ? (
              <ButtonExpanderColumn disabled />
            ) : (
              <Skeleton className="h-10 w-full" />
            )}
          </TableCell>
        );
      })}
    </TableRow>
  );
}
