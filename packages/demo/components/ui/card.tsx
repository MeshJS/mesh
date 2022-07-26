const Card = (props) => {
  return (
    <section className="mt-4 p-6 bg-white rounded-lg border border-gray-200 hover:border-slate-400 dark:hover:border-slate-400 shadow-md dark:bg-gray-800 dark:border-gray-700">
      {props.children}
    </section>
  );
};

export default Card;
