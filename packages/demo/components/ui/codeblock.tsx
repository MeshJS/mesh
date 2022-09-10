const Codeblock = ({ data, isJson = true }) => {
  return (
    <div className=" max-h-screen overflow-auto">
      <pre className="mt-0">
        <code className="language-js">
          {isJson ? JSON.stringify(data, null, 2) : data}
        </code>
      </pre>
    </div>
  );
};

export default Codeblock;
