import type { NextPage } from 'next';
import Resolvers from '../../components/pages/apis/resolvers';
import Metatags from '../../components/site/metatags';

const ResolversPage: NextPage = () => {
  return (
    <>
      <Metatags
        title="Resolvers"
        description="Help functions that you need while building dApps"
      />
      <Resolvers />
    </>
  );
};

export default ResolversPage;
