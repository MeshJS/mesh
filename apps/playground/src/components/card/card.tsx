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
      className={`mt-4 overflow-x-hidden rounded-lg border border-gray-200 bg-white p-6 shadow-md dark:border-gray-700 dark:bg-gray-800 ${
        className && className
      }`}
    >
      {title && (
        <div className="bg-white text-left text-lg font-semibold text-gray-900 dark:bg-gray-800 dark:text-white">
          {title}
          {subtitle && (
            <p className="mt-1 text-sm font-normal text-gray-500 dark:text-gray-400">
              {subtitle}
            </p>
          )}
        </div>
      )}
      {children}
    </section>
  );
}
