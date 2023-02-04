import type { NextPage } from 'next';
import Link from 'next/link';
import GuidesLayout from '../../components/pages/guides/layout';
import Codeblock from '../../components/ui/codeblock';
import { Element } from 'react-scroll';
import Metatags from '../../components/site/metatags';

const ReactGetStartedPage: NextPage = () => {
  const sidebarItems = [
    { label: 'Installation', to: 'installation' },
    { label: 'Setup MeshProvider', to: 'meshProvider' },
  ];

  let codeMeshProvider = ``;
  codeMeshProvider += `import { MeshProvider } from "@meshsdk/react";\n`;
  codeMeshProvider += `\n`;
  codeMeshProvider += `function MyApp({ Component, pageProps }: AppProps) {\n`;
  codeMeshProvider += `  return (\n`;
  codeMeshProvider += `    <MeshProvider>\n`;
  codeMeshProvider += `      <Component {...pageProps} />\n`;
  codeMeshProvider += `    </MeshProvider>\n`;
  codeMeshProvider += `  );\n`;
  codeMeshProvider += `};\n`;

  return (
    <>
      <Metatags
        title="Getting Started with Mesh and React"
        description="Start building web3 applications, interact with your contracts using your wallets."
      />
      <GuidesLayout
        title="Getting Started with Mesh and React"
        desc="Start building web3 applications, interact with your contracts using your wallets."
        sidebarItems={sidebarItems}
        image="/react/athlete-gca57603b5_1280.jpg"
      >
        {/* <Element name="installation">
          <h2>Install with CLI</h2>
          <p>
            The easiest way to get started building your own app is to use the
            Mesh CLI to install one of our templates.
          </p>
          <p>
            For instance, create a new starter project with Next.js & TypeScript
            with:
          </p>
          <Codeblock data={`npx mesh create --starter nextjs`} isJson={false} />
          <p>
            Visit <Link href="/starter-templates">Starter Templates</Link>{' '}
            and kick start your project with one of our starters.
          </p>
        </Element> */}

        <Element name="installation">
          <h2>Install Mesh React</h2>
          <p>
            Mesh provide a collection of useful UI components, so you can easily
            include web3 functionality and convenient utilities for your
            application.
          </p>
          <p>
            To start, install <code>mesh-react</code>:
          </p>
          <Codeblock data={`npm install @meshsdk/react`} isJson={false} />
          <p>
            Next, let's add <code>MeshProvider</code> to the root of the
            application.
          </p>
        </Element>

        <Element name="meshProvider">
          <h2>
            Setup <code>MeshProvider</code>
          </h2>
          <p>
            <a
              href="https://reactjs.org/docs/context.html"
              target="_blank"
              rel="noreferrer"
            >
              React Context
            </a>{' '}
            allows apps to share data across the app, and{' '}
            <code>MeshProvider</code> allows your app to subscribe to context
            changes. If you use the CLI to initialize your project,{' '}
            <code>MeshProvider</code> has been added in the root component.
            Otherwise, you can wrap <code>MeshProvider</code> at the root of
            your application, for example in Next.js:
          </p>
          <Codeblock data={codeMeshProvider} isJson={false} />
          <p>
            Now your application is ready, explore the available{' '}
            <Link href="/react/ui-components">UI components</Link> and{' '}
            <Link href="/react/wallet-hooks">wallet hooks</Link> and start using
            them in your application.
          </p>
        </Element>
      </GuidesLayout>
    </>
  );
};

export default ReactGetStartedPage;
