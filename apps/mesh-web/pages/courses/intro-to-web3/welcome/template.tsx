import type { NextPage } from 'next';
import Link from 'next/link';
import CourseLayout from '../../../../components/courses/layout';
import Codeblock from '../../../../components/ui/codeblock';
import Sidebar from './../common/sidebar';

const CoursesSendLovelacePage: NextPage = () => {
  return (
    <CourseLayout
      coursesSidebar={<Sidebar />}
      title={`Send Lovelace`}
      desc={`A nice description here`}
      // youtubeId="ITxcbrfEcIY"
    >
      <Content />
    </CourseLayout>
  );
};

export default CoursesSendLovelacePage;

function Content() {
  return (
    <>
      <p>say some intro</p>
      <p>If need image:</p>
      <figure>
        <img src="/courses/intro-to-web3/starter-template.png" alt="" />
        <figcaption>Visual Studio Code workspace setup</figcaption>
      </figure>
      <h3>If need heading</h3>
      <p>some more words.</p>
      <p>
        If need link to internal page:{' '}
        <Link href="/starter-templates">starter templates</Link>
      </p>
      <p>If need code</p>
      <Codeblock
        data={'npx create-mesh-app . -t starter -s next -l ts'}
        isJson={false}
      />
      <p>
        if need external page{' '}
        <a href="http://localhost:3000" target="_blank" rel="noreferrer">
          http://localhost:3000
        </a>
        .
      </p>
    </>
  );
}
