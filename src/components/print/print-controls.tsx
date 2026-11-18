import type { TPrintControls } from "@/components/print/use-print-controls";
import { usePrintControls } from "@/components/print/use-print-controls";
import { Combobox } from "@/components/ui/combobox";

export function ComboboxPrinter({ printControls }: { printControls: TPrintControls }) {
  const { printerOptions, printer, selectPrinter, isBusy } = printControls;
  return (
    <Combobox
      testId="combobox-printer"
      className="w-auto"
      items={printerOptions}
      take={printerOptions.length}
      activeItem={printer}
      formatItem={(item) => item?.name ?? ""}
      onValueChange={(item) => {
        if (item !== null) selectPrinter(item.id);
      }}
      nullable={false}
      loading={isBusy}
    />
  );
}

interface PrintControlsProps {
  children: (printPdf: TPrintControls["printPdf"], isPrinting: boolean) => React.ReactNode;
}

export default function PrintControls({ children }: PrintControlsProps) {
  const printControls = usePrintControls({ forTags: false });
  return (
    <>
      <ComboboxPrinter printControls={printControls} />
      {children(printControls.printPdf, printControls.isBusy)}
    </>
  );
}
