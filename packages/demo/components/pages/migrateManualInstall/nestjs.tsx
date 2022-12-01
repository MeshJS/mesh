import Codeblock from '../../ui/codeblock';
import SectionTwoCol from '../../common/sectionTwoCol';

export default function InstallNestjs() {
  return (
    <SectionTwoCol
      sidebarTo="nestjs"
      header="NestJS"
      leftFn={Left()}
      rightFn={() => {
        return <></>;
      }}
    />
  );
}

function Left() {
  return (
    <>
      <h3>1. Install @martifylabs/mesh package</h3>
      <p>Install the latest version of Mesh with yarn:</p>
      <Codeblock data={`yarn add @martifylabs/mesh`} isJson={false} />
      <p>That's all. Start building.</p>
    </>
  );
}
