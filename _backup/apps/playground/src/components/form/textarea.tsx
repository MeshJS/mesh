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
    "block p-2.5 w-full text-sm text-neutral-900 bg-neutral-50 rounded-lg border border-neutral-300 focus:ring-blue-500 focus:border-blue-500 dark:bg-neutral-700 dark:border-neutral-600 dark:placeholder-neutral-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500 mb-4";

  if (className.length > 0) {
    _classname = className;
  }

  return (
    <>
      {label && (
        <label className="mb-2 block text-sm font-medium text-neutral-900 dark:text-white">
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
