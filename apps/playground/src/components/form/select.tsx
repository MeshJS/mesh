export default function Select({
  id = "select",
  options,
  value,
  onChange,
  label = "Select an option",
  hasDefaultOption = false,
}: {
  id?: string;
  options: {};
  value: string | number;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  disabled?: boolean;
  label?: undefined | string;
  hasDefaultOption?: boolean;
}) {
  return (
    <>
      <label
        htmlFor={id}
        className="mb-2 block text-sm font-medium text-gray-900 dark:text-gray-400"
      >
        {label}
      </label>
      <select
        id={id}
        className="mb-4 block w-full rounded-lg border border-gray-300 bg-gray-50 p-2.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 dark:focus:border-blue-500 dark:focus:ring-blue-500"
        onChange={onChange}
        value={value}
      >
        {hasDefaultOption && <option>{label}</option>}
        {Object.keys(options).map((option, i) => {
          return (
            <option value={option} key={i}>
              {/* @ts-ignore */}
              {options[option]}
            </option>
          );
        })}
      </select>
    </>
  );
}
