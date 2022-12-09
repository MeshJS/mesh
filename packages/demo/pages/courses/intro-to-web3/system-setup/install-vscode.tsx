import type { NextPage } from 'next';
import CourseLayout from '../../../../components/courses/layout';
import Codeblock from '../../../../components/ui/codeblock';
import Sidebar from './../common/sidebar';

const CoursesInstallVScodePage: NextPage = () => {
  return (
    <CourseLayout
      coursesSidebar={<Sidebar />}
      title={`Install Visual Studio Code`}
      desc={`Download Visual Studio Code, one of the most popular developer source-code editor.`}
      youtubeId="ITxcbrfEcIY"
    >
      <Content />
    </CourseLayout>
  );
};

export default CoursesInstallVScodePage;

function Content() {
  return (
    <>
      <p>
        Visual Studio Code (VS Code) is a lightweight but powerful source code
        editor. Getting up and running with Visual Studio Code is quick and
        easy. It is available for Windows, macOS, and Linux operating systems.
      </p>
      <p>
        To install Visual Studio Code, you will need to download the appropriate
        installer for your operating system from the official Visual Studio Code
        website. Once the download is complete, you can run the installer and
        follow the on-screen instructions to complete the installation.
      </p>

      <p>Here is a brief overview of the steps you will need to follow:</p>
      <ol>
        <li>
          Go to the official{' '}
          <a
            href="https://code.visualstudio.com/"
            target="_blank"
            rel="noreferrer"
          >
            Visual Studio Code website
          </a>
          .
        </li>
        <li>Click on the "Download" button to download the latest version.</li>
        <li>
          Once the download is complete, run the installer and follow the
          on-screen instructions to complete the installation.
        </li>
      </ol>
      <p>
        Keep in mind that the exact steps may vary depending on your operating
        system, so you may need to consult the official Visual Studio Code
        documentation for more detailed instructions.
      </p>

      <ul>
        <li>
          <a
            href="https://code.visualstudio.com/docs/setup/windows"
            target="_blank"
            rel="noreferrer"
          >
            Windows
          </a>
        </li>
        <li>
          <a
            href="https://code.visualstudio.com/docs/setup/mac"
            target="_blank"
            rel="noreferrer"
          >
            macOS
          </a>
        </li>
        <li>
          <a
            href="https://code.visualstudio.com/docs/setup/linux"
            target="_blank"
            rel="noreferrer"
          >
            Linux
          </a>
        </li>
      </ul>
      <p>
        Check out the following docs by Visual Studio Code to learn more about:
      </p>
      <ul>
        <li>
          <a
            href="https://code.visualstudio.com/docs/terminal/basics"
            target="_blank"
            rel="noreferrer"
          >
            Terminal
          </a>
        </li>
        <li>
          <a
            href="https://code.visualstudio.com/docs/nodejs/working-with-javascript"
            target="_blank"
            rel="noreferrer"
          >
            Working with JavaScript
          </a>
        </li>
        <li>
          <a
            href="https://code.visualstudio.com/docs/nodejs/reactjs-tutorial"
            target="_blank"
            rel="noreferrer"
          >
            Using React in VS Code
          </a>
        </li>
      </ul>
      <h3>Install Useful Extensions</h3>
      <p>
        Visual Studio Code{' '}
        <a
          href="https://code.visualstudio.com/docs/nodejs/extensions"
          target="_blank"
          rel="noreferrer"
        >
          extensions
        </a>{' '}
        can add more features to the overall development experience. Here are
        some extensions that I'm using:
      </p>
      <ul>
        <li>
          <a
            href="https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode"
            target="_blank"
            rel="noreferrer"
          >
            Prettier - Code formatter
          </a>
        </li>
        <li>
          <a
            href="https://marketplace.visualstudio.com/items?itemName=xabikos.JavaScriptSnippets"
            target="_blank"
            rel="noreferrer"
          >
            JavaScript (ES6) code snippets
          </a>
        </li>
        <li>
          <a
            href="https://marketplace.visualstudio.com/items?itemName=PKief.material-icon-theme"
            target="_blank"
            rel="noreferrer"
          >
            Material Icon Theme
          </a>
        </li>
      </ul>
    </>
  );
}
