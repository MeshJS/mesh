import Codeblock from '../../ui/codeblock';
import SectionTwoCol from '../../common/sectionTwoCol';

export default function InstallVueVite() {
  return (
    <SectionTwoCol
      sidebarTo="vuevite"
      header="Vue and Vite"
      leftFn={Left()}
      rightFn={Right()}
    />
  );
}

let viteCode = '';
viteCode += `import wasm from 'vite-plugin-wasm'\n`;
viteCode += `import vue from '@vitejs/plugin-vue'\n`;
viteCode += `import AutoImport from 'unplugin-auto-import/vite'\n`;
viteCode += `import ElementPlus from 'unplugin-element-plus/vite'\n`;
viteCode += `import Components from 'unplugin-vue-components/vite'\n`;
viteCode += `import topLevelAwait from 'vite-plugin-top-level-await'\n`;
viteCode += `\n`;
viteCode += `import { defineConfig } from 'vite'\n`;
viteCode += `import { fileURLToPath, URL } from 'node:url'\n`;
viteCode += `import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'\n`;
viteCode += `import { NodeGlobalsPolyfillPlugin } from '@esbuild-plugins/node-globals-polyfill'\n`;
viteCode += `\n`;
viteCode += `// https://vitejs.dev/config/\n`;
viteCode += `export default defineConfig({\n`;
viteCode += `  plugins: [\n`;
viteCode += `    vue(),\n`;
viteCode += `    wasm(),\n`;
viteCode += `    topLevelAwait(),\n`;
viteCode += `\n`;
viteCode += `    ElementPlus({\n`;
viteCode += `      // 引入的样式的类型，可以是css、sass、less等，\n`;
viteCode += `      importStyle: 'css',\n`;
viteCode += `      useSource: true\n`;
viteCode += `    }),\n`;
viteCode += `\n`;
viteCode += `    AutoImport({\n`;
viteCode += `      resolvers: [ElementPlusResolver()]\n`;
viteCode += `    }),\n`;
viteCode += `\n`;
viteCode += `    Components({\n`;
viteCode += `      resolvers: [ElementPlusResolver()]\n`;
viteCode += `    })\n`;
viteCode += `  ],\n`;
viteCode += `\n`;
viteCode += `  resolve: {\n`;
viteCode += `    alias: {\n`;
viteCode += `      '@': fileURLToPath(new URL('./src', import.meta.url))\n`;
viteCode += `    }\n`;
viteCode += `  },\n`;
viteCode += `\n`;
viteCode += `  optimizeDeps: {\n`;
viteCode += `    esbuildOptions: {\n`;
viteCode += `      // Node.js global to browser globalThis\n`;
viteCode += `      define: {\n`;
viteCode += `        global: 'globalThis'\n`;
viteCode += `      },\n`;
viteCode += `      // Enable esbuild polyfill plugins\n`;
viteCode += `      plugins: [\n`;
viteCode += `        NodeGlobalsPolyfillPlugin({\n`;
viteCode += `          buffer: true\n`;
viteCode += `        })\n`;
viteCode += `      ]\n`;
viteCode += `    }\n`;
viteCode += `  }\n`;
viteCode += `})\n`;

let packageCode = '';
packageCode += `{\n`;
packageCode += `  "name": "meshjs-simple-minting",\n`;
packageCode += `  "version": "0.0.0",\n`;
packageCode += `  "private": true,\n`;
packageCode += `  "scripts": {\n`;
packageCode += `    "dev": "vite",\n`;
packageCode += `    "build": "vite build",\n`;
packageCode += `    "preview": "vite preview",\n`;
packageCode += `    "lint": "eslint . --ext .vue,.js,.jsx,.cjs,.mjs --fix --ignore-path .gitignore",\n`;
packageCode += `    "format": "prettier --write src/"\n`;
packageCode += `  },\n`;
packageCode += `  "dependencies": {\n`;
packageCode += `    "@meshsdk/core": "^1.5.2",\n`;
packageCode += `    "buffer": "^6.0.3",\n`;
packageCode += `    "element-plus": "^2.3.3",\n`;
packageCode += `    "vite-plugin-top-level-await": "^1.3.0",\n`;
packageCode += `    "vite-plugin-wasm": "^3.2.2",\n`;
packageCode += `    "vue": "^3.2.47",\n`;
packageCode += `    "vuesax": "^4.0.1-alpha.25"\n`;
packageCode += `  },\n`;
packageCode += `  "devDependencies": {\n`;
packageCode += `    "@esbuild-plugins/node-globals-polyfill": "^0.2.3",\n`;
packageCode += `    "@rushstack/eslint-patch": "^1.2.0",\n`;
packageCode += `    "@vitejs/plugin-vue": "^4.0.0",\n`;
packageCode += `    "@vue/eslint-config-prettier": "^7.1.0",\n`;
packageCode += `    "eslint": "^8.34.0",\n`;
packageCode += `    "eslint-plugin-vue": "^9.9.0",\n`;
packageCode += `    "prettier": "^2.8.4",\n`;
packageCode += `    "unplugin-auto-import": "^0.15.2",\n`;
packageCode += `    "unplugin-element-plus": "^0.7.0",\n`;
packageCode += `    "unplugin-vue-components": "^0.24.1",\n`;
packageCode += `    "vite": "^4.1.4"\n`;
packageCode += `  }\n`;
packageCode += `}\n`;

function Left() {
  return (
    <>
      <h3>Demo and Repos</h3>

      <p>
        Check out this{' '}
        <a
          href="https://mesh-js-simple-minting.vercel.app/"
          target="_blank"
          rel="noreferrer"
        >
          demo
        </a>{' '}
        amd full implementation and configurations in this{' '}
        <a
          href="https://github.com/sk1ppi/cardano_meshjs_vue_elementplus"
          target="_blank"
          rel="noreferrer"
        >
          GitHub repo
        </a>
        .
      </p>
      <h3>Configurations</h3>

      <p>
        <b>package.json</b>
      </p>
      <Codeblock data={packageCode} isJson={false} />

      <p>
        <b>vite.config.js</b>
      </p>
      <Codeblock data={viteCode} isJson={false} />
    </>
  );
}

function Right() {
  return <></>;
}
