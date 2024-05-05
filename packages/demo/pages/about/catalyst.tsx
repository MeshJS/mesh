import type { NextPage } from 'next';
import Metatags from '../../components/site/metatags';
import Catalyst from '../../components/pages/about/catalyst';

const MediaPage: NextPage = () => {
  return (
    <>
      <Metatags title="Catalyst" />
      <Catalyst />
    </>
  );
};

export default MediaPage;
