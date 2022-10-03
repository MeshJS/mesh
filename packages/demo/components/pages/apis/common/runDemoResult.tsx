import Codeblock from '../../../ui/codeblock';

export default function RunDemoResult({ response, label = 'Result' }) {
  return (
    <>
      {response !== null && (
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
