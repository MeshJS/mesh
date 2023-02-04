export default function Select({
  id,
  options,
  value,
  onChange,
  label = 'Select an option',
  hasDefaultOption = false,
}: {
  id: string;
  options: {};
  value;
  onChange;
  disabled?: boolean;
  label?: undefined | string;
  hasDefaultOption?: boolean;
}) {
  return (
    <>
      <label
        htmlFor={id}
        className="block mb-2 text-sm font-medium text-gray-900 dark:text-gray-400"
      >
        {label}
      </label>
      <select
        id={id}
        className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500 mb-4"
        onChange={onChange}
        value={value}
      >
        {hasDefaultOption && <option>{label}</option>}
        {Object.keys(options).map((option, i) => {
          return (
            <option value={option} key={i}>
              {options[option]}
            </option>
          );
        })}
      </select>
    </>
  );
}
