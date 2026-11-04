export default function DisabledMessage({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-testid="div-disabled-message"
      className="absolute inset-0 z-10 grid h-full w-full place-items-center rounded-xl bg-white/60"
    >
      <p className="max-w-[90%] rounded-md border-2 border-black bg-white p-2 text-sm text-black">{children}</p>
    </div>
  );
}
