import Highlight from 'react-highlight';

export default function Codeblock({
  data,
  language = 'language-js',
  isJson = true,
}) {
  return (
    <div className="max-h-screen overflow-auto">
      <pre>
        {language == 'language-js' && (
          <Highlight className={language}>
            {isJson ? JSON.stringify(data, null, 2) : data}
          </Highlight>
        )}
        {language == 'language-hs' && (
          <Highlight className={language}>
            {isJson ? JSON.stringify(data, null, 2) : data}
          </Highlight>
        )}
      </pre>
    </div>
  );
}
