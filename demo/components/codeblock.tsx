const Codeblock = ({ data, isJson = true }) => {
  return (
    <article className="prose">
      <pre>
        <code className="language-js">
          {isJson ? JSON.stringify(data, null, 2) : data}
        </code>
      </pre>
    </article>
  );
};

export default Codeblock;
