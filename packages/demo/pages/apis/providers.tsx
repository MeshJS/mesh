import type { NextPage } from 'next';
import Providers from '../../components/pages/apis/providers';
import Metatags from '../../components/site/metatags';

const ProvidersPage: NextPage = () => {
  return (
    <>
      <Metatags
        title="Providers"
        description="Utilize these community driven service providers to speed up development"
      />
      <Providers />
    </>
  );
};

export default ProvidersPage;
