const Textarea = ({
  value,
  onChange,
  className = "",
  disabled = false,
  rows = 4,
  label = undefined,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  className?: string;
  disabled?: boolean;
  rows?: number;
  label?: undefined | string;
}) => {
  let _classname =
    "block p-2.5 w-full text-sm text-gray-900 bg-gray-50 rounded-lg border border-gray-300 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500 mb-4";

  if (className.length > 0) {
    _classname = className;
  }

  return (
    <>
      {label && (
        <label className="mb-2 block text-sm font-medium text-gray-900 dark:text-white">
          {label}
        </label>
      )}
      <textarea
        rows={rows}
        className={_classname}
        value={value}
        onChange={onChange}
        disabled={disabled}
      ></textarea>
    </>
  );
};

export default Textarea;
