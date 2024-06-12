import type { NextPage } from 'next';
import Metatags from '../../components/site/metatags';

const CoursesPage: NextPage = () => {
  return (
    <>
      <Metatags title="Courses" description="Learn to build on Web3." />
      List of courses
    </>
  );
};

export default CoursesPage;
