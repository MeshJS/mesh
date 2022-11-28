import tw from 'twin.macro';
import { useLovelace, useWalletList } from '@mesh/hooks';
import { ChevronDown } from '../ChevronDown';

const StyledIcon = tw.img`
  h-6 m-2
`;

const StyledSmall = tw.span`
  text-xs
`;

export const WalletBalance = ({ connected, name, connecting }) => {
  const wallet = useWalletList().find((wallet) => wallet.name === name);
  const balance = useLovelace();

  return connected && balance && wallet?.icon ? (
    <>
      <StyledIcon src={wallet.icon} />
      ₳ {parseInt((parseInt(balance, 10) / 1_000_000).toString(), 10)}.
      <StyledSmall>{balance.substr(balance.length - 6)}</StyledSmall>
    </>
  ) : connected && wallet?.icon ? (
    <>
      <StyledIcon src={wallet.icon} />
    </>
  ) : connecting ? (
    <>Connecting...</>
  ) : (
    <>
      Connect Wallet <ChevronDown />
    </>
  );
};
