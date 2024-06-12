import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../../../common/sectionTwoCol';
import { MeshBadge } from '@meshsdk/react';
import { useState } from 'react';

export default function UiPoweredByMesh() {
  const [darkMode, setDarkMode] = useState<boolean>(false);
  return (
    <>
      <SectionTwoCol
        sidebarTo="poweredByMesh"
        header="Powered by Mesh Badge"
        leftFn={Left()}
        rightFn={Right(darkMode, setDarkMode)}
      />
    </>
  );
}

function Left() {
  return (
    <>
      <p>
        If you love Mesh, here's a beautifully designed badge for you to embed
        in your application.
      </p>
    </>
  );
}

function Right(darkMode, setDarkMode) {
  let code2 = `import { MeshBadge } from '@meshsdk/react';\n\n`;
  code2 += `export default function Page() {\n`;
  code2 += `  return (\n`;
  code2 += `    <>\n`;
  code2 += `      <MeshBadge dark={${darkMode}} />\n`;
  code2 += `    </>\n`;
  code2 += `  );\n`;
  code2 += `}\n`;

  return (
    <Card>
      <Codeblock data={code2} isJson={false} />

      <div className="block mb-4">
        <label className="block mb-2 text-sm font-medium text-gray-900 dark:text-white">
          Dark mode
        </label>
        <div className="flex items-center mb-4">
          <input
            type="radio"
            value="true"
            className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
            checked={darkMode}
            onChange={(e) => setDarkMode(true)}
          />
          <label
            htmlFor="assetlabel-radio-1"
            className="ml-2 text-sm font-medium text-gray-900 dark:text-gray-300"
          >
            True
          </label>
        </div>
        <div className="flex items-center">
          <input
            type="radio"
            value="false"
            className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
            checked={!darkMode}
            onChange={(e) => setDarkMode(false)}
          />
          <label
            htmlFor="assetlabel-radio-2"
            className="ml-2 text-sm font-medium text-gray-900 dark:text-gray-300"
          >
            False
          </label>
        </div>
      </div>

      <MeshBadge dark={darkMode} />
    </Card>
  );
}
