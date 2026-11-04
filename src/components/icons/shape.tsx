import { DiameterIcon, HexagonIcon, ScrewIcon, SquareIcon, VectorPolygonIcon } from "lucide-react";

import TubeIcon from "@/components/icons/tube";
import { cn } from "@/lib/utils";

export default function ShapeIcon({ shapeName, className }: { shapeName?: string | null; className?: string }) {
  if (shapeName == null) {
    return null;
  }
  const props = { "aria-label": shapeName, className: cn("inline size-5 shrink-0", className) };
  const name = shapeName.toLowerCase();
  if (name.includes("redondo")) {
    return <DiameterIcon {...props} className={cn(props.className, "-scale-x-100")} />;
  }
  if (name.includes("hexagonal")) {
    return <HexagonIcon {...props} />;
  }
  if (name.includes("cuadrado")) {
    return <SquareIcon {...props} />;
  }
  if (name.includes("tubo")) {
    return <TubeIcon {...props} />;
  }
  if (name.includes("roscada")) {
    return <ScrewIcon {...props} />;
  }
  return <VectorPolygonIcon {...props} />;
}
