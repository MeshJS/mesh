import FeatureCli from './featureCli';
import FeatureReact from './featureReact';
import FeatureTransaction from './featureTransaction';
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
    </>
  );
}
