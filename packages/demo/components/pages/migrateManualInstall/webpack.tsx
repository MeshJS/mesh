import Codeblock from '../../ui/codeblock';
import SectionTwoCol from '../../common/sectionTwoCol';

export default function InstallWebpack() {
  return (
    <SectionTwoCol
      sidebarTo="webpack"
      header="Webpack"
      leftFn={Left()}
      rightFn={() => {
        return <></>;
      }}
    />
  );
}

function Left() {
  let code = ``;
  code += `const path = require("path");\n`;
  code += `const webpack = require('webpack');\n`;
  code += `\n`;
  code += `module.exports = {\n`;
  code += `  mode: "production",\n`;
  code += `  entry: "./src/index.js",\n`;
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
  code += `  output: {\n`;
  code += `    filename: "main.js",\n`;
  code += `    path: path.resolve(__dirname, "public"),\n`;
  code += `  },\n`;
  code += `};\n`;

  return (
    <>
      <h3>1. Install Buffer and Stream package</h3>
      <Codeblock data={`yarn add buffer stream`} isJson={false} />
      <h3>2. Install @martifylabs/mesh package</h3>
      <p>Install the latest version of Mesh with yarn:</p>
      <Codeblock
        data={`yarn add @martifylabs/mesh @martifylabs/mesh-react`}
        isJson={false}
      />
      <h3>
        3. Add webpack in <code>webpack.config.cjs</code>
      </h3>
      <p>
        Create a new file name <code>webpack.config.cjs</code> and provide the
        following configurations. Your <code>webpack.config.cjs</code> should
        look like this:
      </p>
      <Codeblock data={code} isJson={false} />
    </>
  );
}
