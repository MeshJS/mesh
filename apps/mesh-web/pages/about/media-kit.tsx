import type { NextPage } from 'next';
import Media from '../../components/pages/about/media';
import Metatags from '../../components/site/metatags';

const MediaPage: NextPage = () => {
  return (
    <>
      <Metatags title="Media Kit" />
      <Media />
    </>
  );
};

export default MediaPage;
