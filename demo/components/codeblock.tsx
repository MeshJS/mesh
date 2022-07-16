const Codeblock = ({data}) => {
  return (
    <pre>
        <code className="language-js">{JSON.stringify(data, null, 2)}</code>
      </pre>
  );
};

export default Codeblock;
