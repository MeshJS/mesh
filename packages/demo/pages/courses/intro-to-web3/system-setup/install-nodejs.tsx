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
        for developing server-side web applications. Node.js runs on the{' '}
        <a
          href="https://en.wikipedia.org/wiki/V8_(JavaScript_engine)"
          target="_blank"
          rel="noreferrer"
        >
          V8 JavaScript Engine
        </a>{' '}
        and executes JavaScript code outside a web browser, uses an
        event-driven, non-blocking I/O model that makes it lightweight and
        efficient.
      </p>
      <p>
        <a href="https://www.npmjs.com/" target="_blank" rel="noreferrer">
          NPM
        </a>{' '}
        is the package module which helps javascript developers install
        dependencies effectively.
      </p>
      <h2>Installation of Node.js and NPM</h2>
      <p>
        Installation of Node.js and NPM is straightforward using the installer
        package available at Node.js official web site.
      </p>
      <ul>
        <li>
          Download the LTS installer from{' '}
          <a href="https://nodejs.org/" target="_blank" rel="noreferrer">
            Node.js
          </a>
        </li>
        <li>Run the installer</li>
        <li>Follow the installer steps</li>
        <li>Restart your machine</li>
      </ul>
      <p>
        Now, test Node.js by printing its version using the following command in
        Terminal:
      </p>
      <Codeblock data={`node -v`} isJson={false} />
      <p>and test npm by printing its version using command:</p>
      <Codeblock data={`npm -v`} isJson={false} />
      <p>You are done with installation.</p>
    </>
  );
}
