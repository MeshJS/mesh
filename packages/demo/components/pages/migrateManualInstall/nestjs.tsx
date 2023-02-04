import Codeblock from '../../ui/codeblock';
import SectionTwoCol from '../../common/sectionTwoCol';

export default function InstallNestjs() {
  return (
    <SectionTwoCol
      sidebarTo="nestjs"
      header="NestJS"
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
      <Codeblock data={`npm install @meshsdk/core`} isJson={false} />
      <p>That's all. Start building.</p>
    </>
  );
}

function Right() {
  return <></>;
}
