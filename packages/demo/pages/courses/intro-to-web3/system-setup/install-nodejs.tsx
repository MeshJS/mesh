import type { NextPage } from 'next';
import CourseLayout from '../../../../components/courses/layout';
import Codeblock from '../../../../components/ui/codeblock';
import Sidebar from './../common/sidebar';

const CoursesInstallNodejsPage: NextPage = () => {
  return (
    <CourseLayout
      coursesSidebar={<Sidebar />}
      title={`Install Node.js`}
      desc={`Before we build our first app, let's get Node.js, a JavaScript
      runtime environment, and Node Package Module (NPM).`}
      // youtubeId="EhOVLH3r2Go"
    >
      <Content />
    </CourseLayout>
  );
};

export default CoursesInstallNodejsPage;

function Content() {
  return (
    <>
      <p>
        <a href="https://nodejs.org/" target="_blank" rel="noreferrer">
          Node.js
        </a>{' '}
        is an open-source, cross-platform{' '}
        <a
          href="https://en.wikipedia.org/wiki/Runtime_system"
          target="_blank"
          rel="noreferrer"
        >
          runtime environment
        </a>{' '}
        , It allows developers to run JavaScript on the server side, creating
        web applications that can generate dynamic content. Node.js runs on the{' '}
        <a
          href="https://en.wikipedia.org/wiki/V8_(JavaScript_engine)"
          target="_blank"
          rel="noreferrer"
        >
          V8 JavaScript Engine
        </a>{' '}
        and executes JavaScript code outside a web browser. Node.js uses an
        event-driven, non-blocking I/O model that makes it lightweight and
        efficient, perfect for data-intensive real-time applications that run
        across distributed devices.
      </p>
      <p>
        <a href="https://www.npmjs.com/" target="_blank" rel="noreferrer">
          NPM
        </a>{' '}
        is the package module which helps javascript developers install
        dependencies effectively. It stands for Node Package Manager and it's a
        command-line tool that comes with Node.js that allows developers to
        install and manage a wide variety of third-party JavaScript libraries
        and packages for use in their own projects. It also makes it easy for
        developers to share and reuse code by publishing their own packages to
        the NPM registry, which is a public repository of packages of
        open-source code. NPM is an essential part of the Node.js ecosystem and
        is widely used by developers to streamline their workflow and build
        powerful applications. NPM is the default package manager for Node.js.
      </p>
      <h3>Installation of Node.js and NPM</h3>
      <p>
        Installation of Node.js and NPM is straightforward using the installer
        package available at Node.js official web site.
      </p>
      <p>
        To install Node.js, you will need to download the appropriate installer
        for your operating system from the official Node.js website. Once the
        download is complete, you can run the installer and follow the on-screen
        instructions to complete the installation.
      </p>
      <p>Here is a brief overview of the steps you will need to follow:</p>
      <ol>
        <li>
          Go to the official{' '}
          <a href="https://nodejs.org/" target="_blank" rel="noreferrer">
            Node.js
          </a>{' '}
          website
        </li>
        <li>
          Click on the "Download" button to download the LTS version of Node.js.
        </li>
        <li>
          Once the download is complete, run the installer and follow the
          on-screen instructions to complete the installation.
        </li>
      </ol>
      <p>
        Keep in mind that the exact steps may vary depending on your operating
        system, so you may need to consult the official Node.js documentation
        for more detailed instructions.
      </p>
      <p>
        Once the installation is complete, you can verify that Node.js has been
        successfully installed by opening a command prompt or terminal window
        and typing:
      </p>
      <Codeblock data={`node -v`} isJson={false} />
      <p>and test npm by printing its version using command:</p>
      <Codeblock data={`npm -v`} isJson={false} />
      <p>You should see the Node and NPM version you have installed.</p>
    </>
  );
}
