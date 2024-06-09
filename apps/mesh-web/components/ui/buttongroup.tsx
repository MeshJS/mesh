export default function ButtonGroup({items, currentSelected}) {
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
              'z-10 ring-2 ring-blue-700 text-blue-700 dark:ring-blue-500 dark:text-white border'
            } py-2 px-4 text-sm font-medium text-gray-900 bg-white hover:bg-gray-100 hover:text-blue-700  dark:bg-gray-700 dark:text-white dark:hover:text-white dark:hover:bg-gray-600 border-gray-200 dark:border-gray-600`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
