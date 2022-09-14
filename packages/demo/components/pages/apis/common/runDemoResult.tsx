import Codeblock from '../../../ui/codeblock';

export default function RunDemoResult({ response }) {
  return (
    <>
      {response !== null && (
        <>
          <p>
            <b>Result:</b>
          </p>
          <Codeblock data={response} />
        </>
      )}
    </>
  );
}
