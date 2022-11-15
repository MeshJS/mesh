import type { NextPage } from 'next';
import Metatags from '../../components/site/metatags';
import ReactStarterTemplates from '../../components/pages/starterTemplates';

const ReactStarterTemplatesPage: NextPage = () => {
  return (
    <>
      <Metatags
        title="Starter Templates"
        description="Easiest way to kick start your project with one of our templates."
      />
      <ReactStarterTemplates />
    </>
  );
};

export default ReactStarterTemplatesPage;
