import Codeblock from "~/components/text/codeblock";

export function InstallSmartContract() {
  return (
    <>
      <h3>Install package</h3>
      <p>
        First you can to install the <code>@meshsdk/contracts</code> package:
      </p>
      <Codeblock data={`npm install @meshsdk/contract`} />
    </>
  );
}

export default function Placeholder() {}
