export default function CenterPadded({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-screen-xl px-4 py-4 lg:px-6 lg:py-8">
      {children}
    </div>
  );
}
