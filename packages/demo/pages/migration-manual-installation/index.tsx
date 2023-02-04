import type { NextPage } from 'next';
import CommonLayout from '../../components/common/layout';
import InstallGatsby from '../../components/pages/migrateManualInstall/gatsby';
import InstallNestjs from '../../components/pages/migrateManualInstall/nestjs';
import InstallNextjs from '../../components/pages/migrateManualInstall/nextjs';
import InstallWebpack from '../../components/pages/migrateManualInstall/webpack';
import Metatags from '../../components/site/metatags';

const MigrationManualPage: NextPage = () => {
  const sidebarItems = [
    { label: 'Next.js', to: 'nextjs' },
    { label: 'NestJS', to: 'nestjs' },
    { label: 'Gatsby', to: 'gatsby' },
    { label: 'Webpack', to: 'webpack' },
  ];

  return (
    <CommonLayout sidebarItems={sidebarItems}>
      <Metatags
        title="Install Mesh into your existing project"
        description="Use Mesh into your existing project, you can
        choose the stack and configure them."
      />

      <div className="py-4 px-4 mx-auto max-w-screen-xl lg:py-8 lg:px-6">
        <div className="mx-auto max-w-screen-sm text-center mb-8 lg:mb-16">
          <h2 className="mb-4 text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white">
            Install Mesh into your existing project
          </h2>
          <p className="font-light text-gray-500 sm:text-xl dark:text-gray-400">
            If you are looking to use Mesh into your existing project, you can
            choose the stack and configure them.
          </p>
        </div>
      </div>

      <InstallNextjs />
      <InstallNestjs />
      <InstallGatsby />
      <InstallWebpack />
    </CommonLayout>
  );
};

export default MigrationManualPage;
