import type { NextPage } from 'next';
import CourseLayout from '../../../../components/courses/layout';
import Metatags from '../../../../components/site/metatags';
import Sidebar from './../common/sidebar';

const CoursesPage: NextPage = () => {
  const title = 'Install Node.js';
  const desc = `Before we build our first app, let's get Node.js, a JavaScript
  runtime environment.`;
  return (
    <>
      <Metatags title={title} description={desc} />
      <CourseLayout
        coursesSidebar={<Sidebar />}
        title={title}
        desc={desc}
        youtubeId="EhOVLH3r2Go"
      >
        <Content />
      </CourseLayout>
    </>
  );
};

export default CoursesPage;

function Content() {
  return (
    <>
      <p>
        
      </p>
    </>
  );
}

