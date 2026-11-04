import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Overlay, type OverlayProps } from "@/components/ui/overlay";
import { ERROR_TITLE } from "@/messages/common";

interface ErrorMessageOverlayProps extends OverlayProps {
  message: string;
}

export function ErrorMessageOverlay({ testId = "error-message-overlay", message }: ErrorMessageOverlayProps) {
  return (
    <Overlay testId={testId}>
      <Card>
        <CardHeader>
          <CardTitle>{ERROR_TITLE}</CardTitle>
        </CardHeader>
        <p>{message}</p>
      </Card>
    </Overlay>
  );
}
