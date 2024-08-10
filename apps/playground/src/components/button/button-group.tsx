export default function ButtonGroup({
  items,
  currentSelected,
}: {
  items: { key: string | number; label: string; onClick: () => void }[];
  currentSelected: string | number;
}) {
  return (
    <div className="inline-flex rounded-md shadow-sm" role="group">
      {items.map((item, i) => {
        return (
          <button
            key={i}
            type="button"
            onClick={item.onClick}
            className={`${
              currentSelected == item.key &&
              "z-10 border text-blue-700 ring-2 ring-blue-700 dark:text-white dark:ring-blue-500"
            } border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-100  hover:text-blue-700 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600 dark:hover:text-white`}
            aria-label={item.label}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
