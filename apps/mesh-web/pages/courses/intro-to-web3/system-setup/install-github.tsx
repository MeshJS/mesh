import type { NextPage } from 'next';
import Link from 'next/link';
import CourseLayout from '../../../../components/courses/layout';
import Sidebar from './../common/sidebar';

const CoursesInstallGithubPage: NextPage = () => {
  return (
    <CourseLayout
      coursesSidebar={<Sidebar />}
      title={`Get GitHub Account & Application`}
      desc={`Get a GitHub account and download GitHub application`}
      // youtubeId="ITxcbrfEcIY"
    >
      <Content />
    </CourseLayout>
  );
};

export default CoursesInstallGithubPage;

function Content() {
  return (
    <>
      <p>
        <a href="https://github.com/" target="_blank" rel="noreferrer">
          GitHub
        </a>{' '}
        is a cloud-based service that helps developers store source code, and
        collaborate with others on a project. GitHub also track and manage
        changes to the code with version control.
      </p>
      <figure>
        <img src="/courses/intro-to-web3/github.png" alt="" />
        <figcaption>github.com</figcaption>
      </figure>

      <h3>Sign Up a GitHub Account</h3>
      <p>To sign up for a GitHub account, follow these steps:</p>
      <ol>
        <li>
          Go to{' '}
          <a href="https://github.com/signup" target="_blank" rel="noreferrer">
            github.com
          </a>{' '}
          in your web browser.
        </li>
        <li>
          Click on the "Sign up" button in the top-right corner of the page.
        </li>
        <li>
          Fill out the form that appears with your personal information,
          including your username, email address, and password.
        </li>
        <li>
          Click on the "Sign up for GitHub" button at the bottom of the form to
          create your account.
        </li>
      </ol>
      <p>
        After you sign up for a GitHub account, you can start using the service
        to host and manage your code repositories, collaborate with others on
        projects, and more.
      </p>

      <h3>Create a new repository</h3>
      <p>
        You can store your projects' codes in GitHub repositories. You can use
        repositories to collaborate with others and track your work. To create a
        new repository on GitHub, follow these steps:
      </p>
      <ol>
        <li>Log in to your GitHub account.</li>
        <li>
          In the top-right corner of the page, click on the plus sign (+) and
          select "New repository" from the drop-down menu.
        </li>
        <li>
          Enter a name for your repository, for example,
          "mesh-intro-web3-course"
        </li>
        <li>you may add a brief description (optional).</li>
        <li>
          Select whether you want the repository to be public or private. Public
          repositories are visible to everyone, while private repositories are
          only visible to you and the people you invite to access them.
        </li>
        <li>
          Click on the "Create repository" button to create your new repository.
        </li>
      </ol>
      <p>
        After your repository is created, you can start adding files to it,
        creating branches, and collaborating with others on your project. You
        can also customize the settings and options for your repository to suit
        your specific needs.
      </p>
      <h3>GitHub Desktop</h3>
      <p>
        GitHub Desktop is a free and open-source Git client, a useful tool for
        developers who want to use Git and GitHub to manage their code
        repositories. It is available for Windows and MacOS, and it provides a
        user-friendly graphical interface for common Git operations such as
        cloning, committing, and pushing changes to a repository. To install
        GitHub Desktop, follow these steps: Download the .
      </p>
      <ol>
        <li>
          Go to the{' '}
          <a
            href="https://desktop.github.com/"
            target="_blank"
            rel="noreferrer"
          >
            GitHub Desktop
          </a>{' '}
          .
        </li>
        <li>
          Click on the "Download for Mac" or "Download for Windows" button,
          depending on your operating system.
        </li>
        <li>
          Save the installation file to your computer and run it to begin the
          installation process.
        </li>
        <li>Follow the on-screen instructions to complete the installation.</li>
      </ol>
      <p>
        After you have installed GitHub Desktop, to log in to GitHub Desktop,
        follow these steps:
      </p>
      <ol>
        <li>Launch GitHub Desktop on your computer.</li>
        <li>In the application window, click on the "Sign in" button.</li>
        <li>
          Enter your GitHub username and password, and then click on the "Sign
          in" button.
        </li>
        <li>
          Click on the "Authorize" button to allow GitHub Desktop to access your
          account.
        </li>
      </ol>
      <p>
        After you log in to GitHub Desktop, you can start using the application
        to manage your Git repositories, collaborate with others on projects,
        and more. You can also use GitHub Desktop to access the GitHub website,
        view your profile and repositories, and more.
      </p>
      <p>To clone a repository on GitHub Desktop, follow these steps:</p>
      <ol>
        <li>
          Click on the "File" menu and select "Clone Repository" from the
          drop-down menu.
        </li>
        <li>
          In the "Clone a Repository" window, select the repository you have
          just created.
        </li>
        <li>
          Click on the "Choose..." button to select a local destination for the
          cloned repository.
        </li>
        <li>Click on the "Clone" button to clone the repository.</li>
      </ol>
      <p>
        After the repository is cloned, you can access it from the local
        destination you specified, and you can use GitHub Desktop to manage and
        work with the repository. You can also push changes you make to the
        local repository back to the remote repository on GitHub.
      </p>
    </>
  );
}
