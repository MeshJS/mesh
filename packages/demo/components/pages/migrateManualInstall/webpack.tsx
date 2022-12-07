import Codeblock from '../../ui/codeblock';
import SectionTwoCol from '../../common/sectionTwoCol';

export default function InstallWebpack() {
  return (
    <SectionTwoCol
      sidebarTo="webpack"
      header="Webpack"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

function Left() {
  let code = ``;
  code += `const path = require("path");\n`;
  code += `const webpack = require('webpack');\n`;
  code += `\n`;
  code += `module.exports = {\n`;
  code += `  resolve: {\n`;
  code += `    fallback: {\n`;
  code += `      buffer: require.resolve("buffer"),\n`;
  code += `      stream: require.resolve("stream"),\n`;
  code += `    },\n`;
  code += `  },\n`;
  code += `  plugins: [\n`;
  code += `    new webpack.ProvidePlugin({\n`;
  code += `      Buffer: ["buffer", "Buffer"],\n`;
  code += `    }),\n`;
  code += `  ],\n`;
  code += `  experiments: {\n`;
  code += `    asyncWebAssembly: true,\n`;
  code += `  },\n`;
  code += `};\n`;

  return (
    <>
      <h3>1. Install Buffer and Stream package</h3>
      <Codeblock data={`npm install buffer stream`} isJson={false} />
      <h3>2. Install MeshJS package</h3>
      <p>Install the latest version of Mesh with npm:</p>
      <Codeblock
        data={`npm install @meshsdk/core`}
        isJson={false}
      />
      <h3>
        3. Update <code>webpack.config.cjs</code>
      </h3>
      <p>
        Change your <code>webpack.config.cjs</code> and provide the
        following configurations. Your <code>webpack.config.cjs</code> should
        look like this:
      </p>
      <Codeblock data={code} isJson={false} />
    </>
  );
}

function Right() {
  return <></>;
}
