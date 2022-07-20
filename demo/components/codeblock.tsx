const Codeblock = ({ data, isJson = true }) => {
  return (
    <pre>
      <code className="language-js">
        {isJson ? JSON.stringify(data, null, 2) : data}
      </code>
    </pre>
  );
};

export default Codeblock;
