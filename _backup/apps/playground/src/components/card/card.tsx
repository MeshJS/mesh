export default function Card({
  children,
  className,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
}) {
  return (
    <section
      className={`mt-4 overflow-x-hidden rounded-lg border border-neutral-200 bg-white p-6 shadow-md dark:border-neutral-700 dark:bg-neutral-800 ${
        className && className
      }`}
    >
      {title && (
        <div className="bg-white text-left text-lg font-semibold text-neutral-900 dark:bg-neutral-800 dark:text-white">
          {title}
          {subtitle && (
            <p className="mt-1 text-sm font-normal text-neutral-500 dark:text-neutral-400">
              {subtitle}
            </p>
          )}
        </div>
      )}
      {children}
    </section>
  );
}
