import LoadingSpinner from "@/components/ui/loading-spinner";

const A4_WIDTH = 595;
const A4_HEIGHT = 842;

export default function PDFPagePlaceholder({
  scale,
  landscape = false,
  children = <LoadingSpinner />,
}: {
  scale: number;
  landscape?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="flex shrink-0 flex-col items-center justify-center gap-2 shadow-xl outline outline-border"
      style={{
        width: (landscape ? A4_HEIGHT : A4_WIDTH) * scale,
        height: (landscape ? A4_WIDTH : A4_HEIGHT) * scale,
      }}
    >
      {children}
    </div>
  );
}
