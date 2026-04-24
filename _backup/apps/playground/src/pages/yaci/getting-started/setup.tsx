import Link from "~/components/link";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function YaciSetup() {
  return (
    <TwoColumnsScroll
      sidebarTo="setup"
      title="Set up your system to run Yaci Devkit"
      leftSection={Left()}
    />
  );
}

function Left() {
  return (
    <>
      <h3>Download and install Docker</h3>
      <p>
        You can download Docker from the official website. Docker is a platform
        for developers and sysadmins to develop, deploy, and run applications
        with containers.
      </p>
      <p>
        Go to the{" "}
        <Link href="https://docs.docker.com/get-docker/">Docker website</Link>{" "}
        and download the latest version, then follow the instructions to install
        it.
      </p>
      <p>
        After installing, open the Docker Desktop app and make sure it's running
        in the background.
      </p>
      <h3>Download the latest Yaci DevKit release</h3>
      <p>
        Go to{" "}
        <Link href="https://github.com/bloxbean/yaci-devkit/releases">
          Yaci releases on Github
        </Link>{" "}
        and download the latest release. Under <code>Assets</code>, you will
        find the <code>yaci-devkit-version.zip</code> file.
      </p>
      <p>
        Extract the zip file to a folder on your system. This folder will be
        your Yaci DevKit root directory.
      </p>
    </>
  );
}
