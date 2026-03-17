import TwoColumnsScroll from "~/components/sections/two-columns-scroll";

export default function AikenCommands() {
  return (
    <TwoColumnsScroll
      sidebarTo="commands"
      title="Useful commands"
      leftSection={Left()}
    />
  );
}

function Left() {
  return (
    <>
      <p>
        Here are some useful commands you can use to compile and test your
        scripts.
      </p>
      <ul>
        <li>
          <code>aiken build</code> - compiles the Aiken smart contract and
          generates a <code>plutus.json</code> file which contains type
          information, params, redeemer, datum, and the compiled code for each
          validator of your project and their corresponding hash digests to be
          used in addresses
        </li>
        <li>
          <code>aiken check</code> - type-check a project and run tests
        </li>
        <li>
          <code>aiken docs</code> - if you're writing a library, this generate
          documentation from you project
        </li>
        <li>
          <code>aiken blueprint</code> - provides utility functions to generate
          addresses, apply parameters and convert the build output to various
          formats
        </li>
      </ul>
    </>
  );
}
