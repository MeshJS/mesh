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
        className="mb-2 block text-sm font-medium text-neutral-900 dark:text-neutral-400"
      >
        {label}
      </label>
      <select
        id={id}
        className="mb-4 block w-full rounded-lg border border-neutral-300 bg-neutral-50 p-2.5 text-sm text-neutral-900 focus:border-blue-500 focus:ring-blue-500 dark:border-neutral-600 dark:bg-neutral-700 dark:text-white dark:placeholder-neutral-400 dark:focus:border-blue-500 dark:focus:ring-blue-500"
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
