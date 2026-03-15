import Link from "~/components/link";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function ReactProvider() {
  return (
    <TwoColumnsScroll
      sidebarTo="meshProvider"
      title="Mesh Provider"
      leftSection={Left()}
    />
  );
}

function Left() {
  let example = `import "@meshsdk/react/styles.css";`;
  example += `import { MeshProvider } from "@meshsdk/react";\n`;
  example += `\n`;
  example += `function MyApp({ Component, pageProps }: AppProps) {\n`;
  example += `  return (\n`;
  example += `    <MeshProvider>\n`;
  example += `      <Component {...pageProps} />\n`;
  example += `    </MeshProvider>\n`;
  example += `  );\n`;
  example += `};\n`;

  return (
    <>
      <p>
        <Link href="https://reactjs.org/docs/context.html">React Context</Link>{" "}
        allows apps to share data across the app, and <code>MeshProvider</code>{" "}
        allows your app to subscribe to context changes. If you use the CLI to
        initialize your project, <code>MeshProvider</code> has been added in the
        root component. Otherwise, you can wrap <code>MeshProvider</code> at the
        root of your application, for example in Next.js:
      </p>
      <Codeblock data={example} />
      <p>
        Now your application is ready, explore the available UI components and
        wallet hooks and start using them in your application.
      </p>
    </>
  );
}
