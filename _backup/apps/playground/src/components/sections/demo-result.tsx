import Codeblock from "~/components/text/codeblock";

export default function DemoResult({
  response,
  label = "Result",
}: {
  response: any;
  label?: string;
}) {
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
