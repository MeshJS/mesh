export default function Button(props) {
  const styles = {
    primary:
      'inline-flex items-center border border-indigo-500 bg-indigo-500 text-white rounded-md px-4 py-2 mr-2 mt-2 mb-2 transition duration-500 ease select-none hover:bg-indigo-600 focus:outline-none focus:shadow-outline',
    success:
      'inline-flex items-center border border-green-500 bg-green-500 text-white rounded-md px-4 py-2 mr-2 mt-2 mb-2 transition duration-500 ease select-none hover:bg-green-600 focus:outline-none focus:shadow-outline',
    error:
      'inline-flex items-center border border-red-500 bg-red-500 text-white rounded-md px-4 py-2 mr-2 mt-2 mb-2 transition duration-500 ease select-none hover:bg-red-600 focus:outline-none focus:shadow-outline',
    warning:
      'inline-flex items-center border border-yellow-500 bg-yellow-500 text-white rounded-md px-4 py-2 mr-2 mt-2 mb-2 transition duration-500 ease select-none hover:bg-yellow-600 focus:outline-none focus:shadow-outline',
    info: 'inline-flex items-center border border-teal-500 bg-teal-500 text-white rounded-md px-4 py-2 mr-2 mt-2 mb-2 transition duration-500 ease select-none hover:bg-teal-600 focus:outline-none focus:shadow-outline',
    light:
      'inline-flex items-center border border-gray-200 bg-gray-200 text-gray-700 rounded-md px-4 py-2 mr-2 mt-2 mb-2 transition duration-500 ease select-none hover:bg-gray-300 focus:outline-none focus:shadow-outline',
    dark: 'inline-flex items-center border border-gray-700 bg-gray-700 text-white rounded-md px-4 py-2 mr-2 mt-2 mb-2 transition duration-500 ease select-none hover:bg-gray-800 focus:outline-none focus:shadow-outline',
  };

  let style =
    props.style && styles[props.style] ? styles[props.style] : styles.primary;

  if (props.className) {
    style += ` ${props.className}`;
  }

  style += ` not-format`;

  return (
    <button
      type="button"
      className={style}
      onClick={props.onClick}
      disabled={props.disabled}
    >
      {props.children}
    </button>
  );
}
