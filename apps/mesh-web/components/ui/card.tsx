export default function Card(props) {
  return (
    <section
      className={`mt-4 p-6 bg-white rounded-lg border border-gray-200 shadow-md dark:bg-gray-800 dark:border-gray-700 overflow-x-hidden ${
        props.className && props.className
      }`}
    >
      {props.children}
    </section>
  );
}