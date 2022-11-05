import type { NextPage } from 'next';
import Metatags from '../../components/site/metatags';
import ReactUiComponents from '../../components/pages/react/uiComponents';

const ReactUiComponentsPage: NextPage = () => {
  return (
    <>
      <Metatags
        title="React UI Components"
        description="React frontend components to speed up your app development."
      />
      <ReactUiComponents />
    </>
  );
};

export default ReactUiComponentsPage;
