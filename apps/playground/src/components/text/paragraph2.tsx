export default function Paragraph2({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <p className="font-light text-gray-500 sm:text-xl dark:text-gray-400">
      {children}
    </p>
  );
}
