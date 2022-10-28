import type { NextPage } from 'next';
import Metatags from '../../components/site/metatags';
import ReactUiComponents from '../../components/pages/react/starterTemplates';

const ReactStarterTemplatesPage: NextPage = () => {
  return (
    <>
      <Metatags
        title="Starter Templates"
        description="Easiest way to kick start your project with one of our templates."
      />
      <ReactUiComponents />
    </>
  );
};

export default ReactStarterTemplatesPage;
