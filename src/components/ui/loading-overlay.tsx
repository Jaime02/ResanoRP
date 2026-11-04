import LoadingSpinner from "@/components/ui/loading-spinner";
import { Overlay, type OverlayProps } from "@/components/ui/overlay";

export function LoadingOverlay({ testId = "loading-overlay" }: OverlayProps) {
  return (
    <Overlay testId={testId}>
      <LoadingSpinner />
    </Overlay>
  );
}
