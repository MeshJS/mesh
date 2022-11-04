import tw from 'twin.macro';
import { CheckMark } from './CheckMark';

const StyledItem = tw.div`
  opacity-80 hover:opacity-100
  flex items-center
  cursor-pointer
  px-4 py-2
`;

const StyledIcon = tw.img`
  h-8 m-1 pr-2
`;

const StyledName = tw.span`
  text-xl font-normal
`;

const StyledActive = tw.span`
  ml-auto
`;

export const MenuItem = ({ icon, name, connect, active }) => (
  <StyledItem onClick={connect}>
    <StyledIcon src={icon} />
    <StyledName>
      {name.at(0).toUpperCase() + name.slice(1).toLowerCase()}
    </StyledName>
    {active && (
      <StyledActive>
        <CheckMark />
      </StyledActive>
    )}
  </StyledItem>
);
