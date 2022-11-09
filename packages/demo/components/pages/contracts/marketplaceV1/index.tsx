import CommonLayout from '../../../common/layout';
import MarketplaceBuyAsset from './buyAsset';
import MarketplaceCancelAsset from './cancelListing';
import Hero from './hero';
import MarketplaceListAsset from './listAsset';
import MarketplaceUpdateListing from './updateListing';

export default function ContractsMarketplaceV1() {
  const sidebarItems = [
    { label: 'List Asset', to: 'listAsset' },
    { label: 'Buy Asset', to: 'buyAsset' },
    { label: 'Update Listing', to: 'updateListing' },
    { label: 'Cancel Listing', to: 'cancelListing' },
  ];

  return (
    <CommonLayout sidebarItems={sidebarItems}>
      <Hero />
      <Main />
    </CommonLayout>
  );
}

function Main() {
  return (
    <>
      <MarketplaceListAsset />
      <MarketplaceBuyAsset />
      <MarketplaceUpdateListing />
      <MarketplaceCancelAsset />
    </>
  );
}
