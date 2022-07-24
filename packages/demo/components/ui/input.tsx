const Input = ({ value, onChange, placeholder, type = "text" }) => {
  return (
    <input
      type={type}
      className="bg-gray-50 border border-gray-300 text-gray-900 sm:text-sm rounded-lg focus:ring-primary-600 focus:border-primary-600 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-white-500 dark:focus:border-white-500"
      placeholder={placeholder}
      onChange={onChange}
      value={value}
    />
  );
};

export default Input;
