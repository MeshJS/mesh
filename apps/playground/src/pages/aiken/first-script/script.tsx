import TwoColumnsScroll from "~/components/sections/two-columns-scroll";
import Codeblock from "~/components/text/codeblock";

export default function AikenFirstScript() {
  return (
    <TwoColumnsScroll
      sidebarTo="script"
      title="Write your first smart contract in Aiken"
      leftSection={Left()}
    />
  );
}

function Left() {
  let code1 = ``;
  code1 += `use aiken/hash.{Blake2b_224, Hash}\n`;
  code1 += `use aiken/list\n`;
  code1 += `use aiken/transaction.{ScriptContext}\n`;
  code1 += `use aiken/transaction/credential.{VerificationKey}\n`;
  code1 += `\n`;
  code1 += `type Datum {\n`;
  code1 += `  owner: Hash<Blake2b_224, VerificationKey>,\n`;
  code1 += `}\n`;
  code1 += `\n`;
  code1 += `type Redeemer {\n`;
  code1 += `  msg: ByteArray,\n`;
  code1 += `}\n`;
  code1 += `\n`;
  code1 += `validator {\n`;
  code1 += `  fn hello_world(datum: Datum, redeemer: Redeemer, context: ScriptContext) -> Bool {\n`;
  code1 += `    let must_say_hello =\n`;
  code1 += `      redeemer.msg == "Hello, World!"\n`;
  code1 += `\n`;
  code1 += `    let must_be_signed =\n`;
  code1 += `      list.has(context.transaction.extra_signatories, datum.owner)\n`;
  code1 += `\n`;
  code1 += `    must_say_hello && must_be_signed\n`;
  code1 += `  }\n`;
  code1 += `}\n`;

  return (
    <>
      <p>
        In this section, we will walk you through the process of writing a
        simple smart contract in Aiken.
      </p>
      <p>
        We will use the Visual Studio Code editor for this tutorial. You can use
        any other editor of your choice, but we recommend using Visual Studio
        Code for its rich feature set and support for Aiken.
      </p>
      <p>First, we create a new Aiken project within this project folder:</p>
      <Codeblock
        data={`$ aiken new meshjs/hello_world\n$ cd hello_world\n$ aiken check`}
      />
      <p>
        Remember to check your Aiken project by running <code>aiken check</code>{" "}
        after creating a new project and as you develop the contract.
      </p>
      <h3>Write the smart contract</h3>
      <p>
        Let's create file for our validator,{" "}
        <code>validators/hello_world.ak</code>:
      </p>
      <Codeblock data={code1} />
      <p>The validator checks for two conditions:</p>
      <ul>
        <li>
          The redeemer message is <code>Hello, World!</code>
        </li>
        <li>The transaction is signed by the owner</li>
      </ul>
      <p>
        If both conditions are met, the validator returns <code>true</code>.
        Otherwise, it returns <code>false</code>.
      </p>
    </>
  );
}
