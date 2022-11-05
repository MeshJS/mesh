import Codeblock from '../ui/codeblock';

export default function RunDemoResult({ response, label = 'Result' }) {
  return (
    <>
      {response !== null && response !== undefined && (
        <>
          <p>
            <b>{label}:</b>
          </p>
          <Codeblock data={response} />
        </>
      )}
    </>
  );
}
