import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function ReactInstall() {
  return (
    <TwoColumnsScroll
      sidebarTo="reactInstall"
      title="Install"
      leftSection={Left()}
    />
  );
}

function Left() {
  return (
    <>
      <p>To start, install:</p>
      <Codeblock data={`npm install @meshsdk/react`} />

      <p>
        Next, add the Mesh CSS to your application, doing so will apply the
        default styles to the components:
      </p>
      <Codeblock data={`import "@meshsdk/react/styles.css";`} />
    </>
  );
}
