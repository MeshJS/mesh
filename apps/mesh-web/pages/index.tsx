import type { NextPage } from 'next';
import Home from '../components/pages/home';
import Metatags from '../components/site/metatags';

const HomePage: NextPage = () => {
  return (
    <>
      <Metatags />
      <Home />
    </>
  );
};

export default HomePage;
