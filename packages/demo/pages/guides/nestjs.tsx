import type { NextPage } from 'next';
import Link from 'next/link';
import GuidesLayout from '../../components/pages/guides/layout';
import Codeblock from '../../components/ui/codeblock';
import { Element } from 'react-scroll';
import Metatags from '../../components/site/metatags';

const GuideNextjsPage: NextPage = () => {
  const sidebarItems = [
    { label: 'System setup', to: 'systemsetup' },
    { label: 'Setup Next.js', to: 'setupnextjs' },
    { label: 'Setup Mesh', to: 'setupmesh' },
    { label: 'See it in action', to: 'seeitinaction' },
  ];

  return (
    <>
      <Metatags
        title="Start a NestJS backend"
        description="Setup a backend server to for minting NFTs"
      />
      <GuidesLayout
        title="Start a NestJS backend"
        desc="Setup a backend server to for minting NFTs"
        sidebarItems={sidebarItems}
        image="/guides/laptop-g44c60b4ed_1280.jpg"
      >
        <p>
          <a href="https://nestjs.com/" target="_blank" rel="noreferrer">
            NestJS
          </a>{' '}
          is a Node.js framework used for building highly scalable server-side
          applications.
        </p>
        {/* <p>
          As this is a intermediate-level guide, if you are new to JavaScript or
          programming in general, it is recommended that you start with the{' '}
          <Link href="/guides/nextjs">Start a Web3 app on Next.js</Link> guide.
        </p> */}
        <p>
          If you are looking for frontend web development, visit{' '}
          <Link href="/guides/nextjs">Start a Web3 app on Next.js</Link> guide.
        </p>

        <Element name="systemsetup">
          <h2>Setting up a Nest project</h2>

          <h3>1. New Nest project</h3>
          <p>
            It is recommended to browse the official{' '}
            <a href="https://docs.nestjs.com/" target="_blank" rel="noreferrer">
              NestJS documentation
            </a>{' '}
            to setting up a Nest project.
          </p>
          <p>
            If you do not have Nest CLI, with npm installed, install Nest CLI
            with the follow command:
          </p>
          <Codeblock data={`npm i -g @nestjs/cli`} isJson={false} />
          <p>
            Create a new folder, and start a new Nest project in the folder:
          </p>
          <Codeblock data={`nest new .`} isJson={false} />
          <p>
            Generally, I will change the port for backend server to{' '}
            <code>5000</code> so I can still host my frontend applications on
            port <code>3000</code>. To do so, open <code>src/main.ts</code> and
            change the port:
          </p>
          <Codeblock data={`await app.listen(5000);`} isJson={false} />
          <p>You can start the server with:</p>
          <Codeblock data={`npm run start:dev`} isJson={false} />
          <p>
            Visit{' '}
            <a href="http://localhost:5000" target="_blank" rel="noreferrer">
              http://localhost:5000
            </a>
            , you should see <code>Hello World!</code>.
          </p>

          <h3>2. Install MeshJS package</h3>
          <p>Install the latest version of Mesh with npm:</p>
          <Codeblock data={`npm install @meshsdk/core`} isJson={false} />
        </Element>
      </GuidesLayout>
    </>
  );
};

export default GuideNextjsPage;
