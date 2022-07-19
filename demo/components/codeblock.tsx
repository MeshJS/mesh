const Codeblock = ({ data }) => {
  return (
    <article className="prose w-full">
      <pre>
        <code className="language-js">{JSON.stringify(data, null, 2)}</code>
      </pre>
    </article>
  );
};

export default Codeblock;
