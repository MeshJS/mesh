const Codeblock = ({ data, isJson = true }) => {
  return (
    <pre className="max-h-screen overflow-auto">
      <code className="language-js">
        {isJson ? JSON.stringify(data, null, 2) : data}
      </code>
    </pre>
  );
};

export default Codeblock;
