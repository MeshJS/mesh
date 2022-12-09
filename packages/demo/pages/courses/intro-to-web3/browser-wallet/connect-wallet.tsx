import type { NextPage } from 'next';
import Link from 'next/link';
import CourseLayout from '../../../../components/courses/layout';
import Sidebar from './../common/sidebar';

const CoursesConnectWalletPage: NextPage = () => {
  return (
    <CourseLayout
      coursesSidebar={<Sidebar />}
      title={`Connect Wallet UI Component`}
      desc={`Connect Wallet UI component allows users to connect to your application with their Cardano wallets.`}
      // youtubeId="ITxcbrfEcIY"
    >
      <Content />
    </CourseLayout>
  );
};

export default CoursesConnectWalletPage;

function Content() {
  return (
    <>
      <p></p>
      
    </>
  );
}
