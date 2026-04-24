export default function Input({
  value,
  onChange,
  placeholder = "",
  type = "text",
  className = "",
  disabled = false,
  label = undefined,
}: {
  value: string | number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
  className?: string;
  disabled?: boolean;
  label?: undefined | string;
}) {
  let _classname =
    "shadow-sm bg-neutral-50 border border-neutral-300 text-neutral-900 sm:text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block w-full p-2.5 dark:bg-neutral-700 dark:border-neutral-600 dark:placeholder-neutral-400 dark:text-white dark:focus:ring-primary-500 dark:focus:border-primary-500 mb-4";

  if (className.length > 0) {
    _classname += ` ${className}`;
  }

  return (
    <>
      {label && (
        <label className="mb-2 block text-sm font-medium text-neutral-900 dark:text-white">
          {label}
        </label>
      )}
      <input
        type={type}
        className={_classname}
        placeholder={placeholder}
        onChange={onChange}
        value={value}
        disabled={disabled}
      />
    </>
  );
}
