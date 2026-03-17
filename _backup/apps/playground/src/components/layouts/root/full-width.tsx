export default function FullWidth({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full justify-between lg:px-4">
      {children}
    </div>
  );
}
