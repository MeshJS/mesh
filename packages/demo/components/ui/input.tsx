export default function Input({
  value,
  onChange,
  placeholder = '',
  type = 'text',
  className = '',
  disabled = false,
  label = undefined,
}:{
  value;
  onChange;
  placeholder?: string;
  type?: string;
  className?: string;
  disabled?: boolean;
  label?: undefined | string;
}) {
  let _classname =
    'shadow-sm bg-gray-50 border border-gray-300 text-gray-900 sm:text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-primary-500 dark:focus:border-primary-500 mb-4';

  if (className.length > 0) {
    _classname += ` ${className}`;
  }

  return (
    <>
      {label && (
        <label className="block mb-2 text-sm font-medium text-gray-900 dark:text-white">
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
