import tw from 'twin.macro';

const StyledItem = tw.div`
  flex items-center
  cursor-pointer
  px-4 py-2
`;

const StyledIcon = tw.img`
  h-12 m-1 pr-2
`;

const StyledName = tw.span`
  text-xl font-normal
`;

export const MenuItem = ({ icon, name, connect }) => (
  <StyledItem onClick={connect}>
    <StyledIcon src={icon} />
    <StyledName>
      {name.at(0).toUpperCase() + name.slice(1).toLowerCase()}
    </StyledName>
  </StyledItem>
);
