import Codeblock from '../../ui/codeblock';
import SectionTwoCol from '../../common/sectionTwoCol';

export default function InstallGatsby() {
  return (
    <SectionTwoCol
      sidebarTo="gatsby"
      header="Gatsby"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <h3>1. Install MeshJs package</h3>
      <p>Install the latest version of Mesh with npm:</p>
      <Codeblock
        data={`npm install @meshsdk/core @meshsdk/react`}
        isJson={false}
      />

      <h3>
        2. Add webpack in <code>gatsby-node.js</code>
      </h3>
      <p>
        Open <code>gatsby-node.js</code> and append <code>webpack</code>{' '}
        configurations. Your <code>gatsby-node.js</code> should look like this:
      </p>
      <Codeblock
        data={`exports.onCreateWebpackConfig = ({ actions }) => {
  actions.setWebpackConfig({
    experiments: {
      syncWebAssembly: true,
    },
    resolve: {
      fallback: {
        stream: false,
      },
    },
  });
};`}
        isJson={false}
      />
    </>
  );
}

function Right() {
  return <></>;
}
