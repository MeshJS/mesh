import CoursesSidebar from '../../../../components/courses/courseSidebar';

export default function Sidebar({}) {
  const menu = [
    {
      type: 'submenu',
      label: 'Welcome',
      url: 'welcome',
      children: [
        {
          label: 'About this course',
          url: 'about-course',
        },
        {
          label: 'Motivation',
          url: 'motivation',
        },
      ],
    },
    {
      type: 'submenu',
      label: 'System setup',
      url: 'system-setup',
      children: [
        {
          label: 'Install Node.js',
          url: 'install-nodejs',
        },
        {
          label: 'Install VS code',
          url: 'install-vscode',
        },
        {
          label: 'Install wallet',
          url: 'install-wallet',
        },
        {
          label: 'Install GitHub',
          url: 'install-github',
        },
        {
          label: 'Create project',
          url: 'create-project',
        },
      ],
    },
    {
      type: 'submenu',
      label: 'Browser wallet',
      url: 'browser-wallet',
      children: [
        {
          label: 'React connect wallet',
          url: 'connect-wallet',
        },
        {
          label: 'Get wallet info',
          url: 'get-wallet-info',
        },
      ],
    },
    {
      type: 'submenu',
      label: 'Basic transactions',
      url: 'basic-transactions',
      children: [
        // {
        //   label: 'Lovelace from faucet',
        //   url: 'get-lovelace',
        // },
        {
          label: 'Send lovelace',
          url: 'send-lovelace',
        },
        {
          label: 'Send assets',
          url: 'send-assets',
        },
      ],
    },
    {
      type: 'submenu',
      label: 'App Wallet',
      url: 'app-wallet',
      children: [
        {
          label: 'Intro App Wallet',
          url: 'app-wallet',
        },
        {
          label: 'Generate wallet',
          url: 'generate-wallet',
        },
        {
          label: 'Load wallet',
          url: 'load-wallet',
        },
      ],
    },
    {
      type: 'submenu',
      label: 'Minting',
      url: 'app-wallet',
      children: [
        {
          label: 'Policy script',
          url: 'policy-script',
        },
        {
          label: 'Asset metadata',
          url: 'asset-metadata',
        },
        {
          label: 'Minting NFT',
          url: 'minting-nft',
        },
        {
          label: 'Multi-signature Minting',
          url: 'multisig-minting',
        },
      ],
    },
    {
      type: 'submenu',
      label: 'Smart contract',
      url: 'smart-contracts',
      children: [
        {
          label: 'Script',
          url: 'script',
        },
        {
          label: 'Redeemer',
          url: 'redeemer',
        },
        {
          label: 'Designing datum',
          url: 'designing-datum',
        },
        {
          label: 'Lock assets',
          url: 'lock-assets',
        },
        {
          label: 'Unlock assets',
          url: 'unlock-assets',
        },
      ],
    },
  ];

  return <CoursesSidebar root="/courses/intro-to-web3" menu={menu} />;
}
