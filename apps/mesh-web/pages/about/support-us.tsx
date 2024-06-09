import type { NextPage } from 'next';
import SupportUs from '../../components/pages/about/support';
import Metatags from '../../components/site/metatags';

const AboutSupportPage: NextPage = () => {
  return (
    <>
      <Metatags title="Support Us" />
      <SupportUs />
    </>
  );
};

export default AboutSupportPage;
