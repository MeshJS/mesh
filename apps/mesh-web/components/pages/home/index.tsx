import FeatureCli from './featureCli';
import FeatureProviders from './featureProviders';
import FeatureReact from './featureReact';
import FeatureTransaction from './featureTransaction';
import FeatureWallet from './featureWallet';
import Hero from './hero';
import Reasons from './reasons';

export default function Home() {
  return (
    <>
      <Hero />
      <Reasons />
      <FeatureReact />
      <FeatureTransaction />
      <FeatureCli />
      <FeatureProviders />
      <FeatureWallet />
    </>
  );
}
