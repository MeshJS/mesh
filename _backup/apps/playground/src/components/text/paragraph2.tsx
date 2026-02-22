export default function Paragraph2({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <p className="font-light text-neutral-500 sm:text-xl dark:text-neutral-400">
      {children}
    </p>
  );
}
