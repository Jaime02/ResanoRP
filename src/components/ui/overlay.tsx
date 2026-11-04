export interface OverlayProps {
  testId?: string;
  children?: React.ReactNode;
}

export function Overlay({ testId, children }: OverlayProps) {
  return (
    <div
      data-testid={testId}
      className="absolute inset-0 flex items-center justify-center rounded-md bg-black/30 outline-8 outline-black/30"
    >
      {children}
    </div>
  );
}
