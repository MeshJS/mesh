import type { NextPage } from 'next';
import Cips from '../../components/pages/about/cips';
import Metatags from '../../components/site/metatags';

const AboutCipsPage: NextPage = () => {
  return (
    <>
      <Metatags title="Implemented CIPs" />
      <Cips />
    </>
  );
};

export default AboutCipsPage;
