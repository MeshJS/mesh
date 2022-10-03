import type { NextPage } from 'next';
import About from '../../components/pages/about';
import Metatags from '../../components/site/metatags';

const AboutPage: NextPage = () => {
  return (
    <>
      <Metatags title="About Mesh" />
      <About />
    </>
  );
};

export default AboutPage;
