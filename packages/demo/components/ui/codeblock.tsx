import Highlight from 'react-highlight'


export default function Codeblock({ data, isJson = true }) {
  return (
    <div className="max-h-screen overflow-auto">
      <pre className="">
        <Highlight className="language-js">
          {isJson ? JSON.stringify(data, null, 2) : data}
        </Highlight>
      </pre>
    </div>
  );
}
