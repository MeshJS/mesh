const Textarea = ({
  value,
  onChange,
  placeholder = '',
  type = 'text',
  className = '',
  disabled = false,
  rows = 4,
}) => {
  let _classname =
    'block p-2.5 w-full text-sm text-gray-900 bg-gray-50 rounded-lg border border-gray-300 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500 mb-4';

  if (className.length > 0) {
    _classname = className;
  }

  return (
    <textarea
      rows={rows}
      className={_classname}
      value={value}
      onChange={onChange}
      disabled={disabled}
    ></textarea>
  );
};

export default Textarea;
