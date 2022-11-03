import tw from 'twin.macro';

const StyledItem = tw.div`
  flex
`;

const StyledIcon = tw.img`
  flex-none h-7 mr-4
`;

const StyledName = tw.span`
  flex-1 flex justify-start items-center h-full text-white font-normal hover:font-bold
`;

export const MenuItem = ({ icon, name }) => (
  <StyledItem>
    <StyledIcon src={icon} />
    <StyledName>{name}</StyledName>
  </StyledItem>
);
