import Link from "~/components/link";
import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function AikenInstallationInstructions() {
  return (
    <TwoColumnsScroll
      sidebarTo="install"
      title="Installation Instructions"
      leftSection={Left()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        This section will guide you through the process of setting up your
        system compile Aiken smart contracts. You can skip this section if you
        have already set up your system or do not wish to compile the contract.
      </p>
      <h3>Using aikup (on Linux & MacOS only)</h3>
      <p>
        If you are using Linux or MacOS, you can use the utility tool to
        download and manage Aiken's pre-compiled executables.
      </p>
      <p>
        You can install the Aiken CLI by running the following command in your
        terminal:
      </p>
      <Codeblock data={`$ curl -sSfL https://install.aiken-lang.org | bash`} />
      <p>
        After installing the Aiken CLI, you can use the following command to
        installs the latest version available. <code>aikup</code> is a
        cross-platform utility tool to download and manage Aiken's across
        multiple versions and for seamless upgrades.
      </p>
      <Codeblock data={`$ aikup`} />
      <h3>From sources (all platforms)</h3>
      <p>
        You will know you have successfully installed Rust and Cargo when you
        can run the following commands in your terminal:
      </p>
      <Codeblock data={`$ rustc --version\n$ cargo --version`} />
      <p>
        Next, you will need to install the Aiken CLI. You can install the Aiken
        CLI by running the following command in your terminal:
      </p>
      <Codeblock data={`$ cargo install aiken`} />
      <h3>Check your installation</h3>
      <p>
        You will know you have successfully installed the Aiken CLI when you can
        run the following command in your terminal:
      </p>
      <Codeblock data={`$ aiken -V`} />
      <p>
        If you face any issues, please check the installation instructions on
        the{" "}
        <Link href="https://aiken-lang.org/installation-instructions">
          Aiken website
        </Link>{" "}
        for more information.
      </p>
    </>
  );
}
