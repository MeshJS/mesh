import type { NextPage } from 'next';
import Link from 'next/link';
import CourseLayout from '../../../../components/courses/layout';
import Codeblock from '../../../../components/ui/codeblock';
import Sidebar from './../common/sidebar';

const CoursesCreateProjectPage: NextPage = () => {
  return (
    <CourseLayout
      coursesSidebar={<Sidebar />}
      title={`Create a new project`}
      desc={`Use starter templates to kick start your project.`}
      // youtubeId="ITxcbrfEcIY"
    >
      <Content />
    </CourseLayout>
  );
};

export default CoursesCreateProjectPage;

function Content() {
  return (
    <>
      <p>
        The front-end of your application is the user interface that users will
        interact with. This can be built using any web development framework. In
        this course, we will be building it on Next.js.
      </p>

      <h3>Prepare Workspace</h3>
      <p>Let's get started!</p>
      <ol>
        <li>
          Create a folder, give it a project name, it should not have any space
          (e.g. <code>my-first-app</code>)
        </li>
        <li>Open Visual Studio Code (VS Code)</li>
        <li>
          From the menu, select <code>File</code> &gt;{' '}
          <code>Add Folder to Workspace</code>
        </li>
        <li>
          Browse to the folder you have created and <code>Add</code> folder into
          your VS Code workspace
        </li>
        <li>
          From the menu, select <code>Terminal</code> &gt;{' '}
          <code>New Terminal</code>
        </li>
      </ol>
      <p>
        Your VS Code is ready. You have your VS Code opened, where the working
        directory is the folder that you have just created, and the Terminal is
        opened as well.
      </p>
      <figure>
        <img src="/courses/intro-to-web3/starter-template.png" alt="" />
        <figcaption>Visual Studio Code workspace setup</figcaption>
      </figure>
      <h3>Install starter template</h3>
      <p>Next, we will install a starter template.</p>
      <p>
        In Mesh SDK, we have a number of{' '}
        <Link href="/starter-templates">starter templates</Link> to choose from,
        you can browse, filter them, choose a project and install it. Installing
        one of templates is the quickest way to get started.
      </p>
      <p>
        In this course, we will kick start with the most basic template,{' '}
        <i>Starter Next.js TypeScript</i>. From the Terminal, run:
      </p>
      <Codeblock
        data={'npx create-mesh-app . -t starter -s next -l ts'}
        isJson={false}
      />
      <p>
        This command is initialize a new project on Next.js. This starter
        template consists of a connect wallet button and wallet integration.
      </p>
      <p>
        Installation should take between 20 seconds to 1 minute. When it is
        done, you should see:
      </p>
      <p>
        <code>✨✨ Welcome to Web 3.0! ✨✨</code>
      </p>
      <p>To start the local web server, from the Terminal, run:</p>
      <Codeblock data={'npm run dev'} isJson={false} />
      <p>Reading the Terminal it should show</p>
      <p>
        <code>
          ready - started server on 0.0.0.0:3000, url: http://localhost:3000
        </code>
      </p>
      <p>
        Go to your browser, and open{' '}
        <a href="http://localhost:3000" target="_blank" rel="noreferrer">
          http://localhost:3000
        </a>
        . You should see the starter template, with a connect wallet component
        in the middle.
      </p>

      <figure>
        <img src="/courses/intro-to-web3/mesh-starter-template.png" alt="" />
        <figcaption>Next.js starter template on web browser</figcaption>
      </figure>

      <p>
        Click on the <code>Connect Wallet</code> button, you should be able to
        see a list of wallets you have installed on your device. Choose a wallet
        to connect. If you have any trouble getting your wallet to connect, you
        may need to enable dApp access from your wallet interface.
      </p>
      <p>
        If you have successfully connected your wallet, the wallet component
        should show the connected wallet's logo.
      </p>
    </>
  );
}
