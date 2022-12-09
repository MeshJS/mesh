import Codeblock from '../../ui/codeblock';
import SectionTwoCol from '../../common/sectionTwoCol';

export default function InstallNextjs() {
  return (
    <SectionTwoCol
      sidebarTo="nextjs"
      header="Next.js"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
  return (
    <>
      <h3>1. Install MeshJS package</h3>
      <p>Install the latest version of Mesh with npm:</p>
      <Codeblock data={`npm install @meshsdk/core @meshsdk/react`} isJson={false} />

      <h3>
        2. Add webpack in <code>next.config.js</code>
      </h3>
      <p>
        Open <code>next.config.js</code> and append <code>webpack</code>{' '}
        configurations. Your <code>next.config.js</code> should look like this:
      </p>
      <Codeblock
        data={`/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: function (config, options) {
    config.experiments = {
      asyncWebAssembly: true,
    };
    return config;
  },
};
module.exports = nextConfig;
`}
        isJson={false}
      />
    </>
  );
}

function Right() {
  return <></>;
}
