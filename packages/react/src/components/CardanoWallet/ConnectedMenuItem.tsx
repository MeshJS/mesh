import tw from 'twin.macro';

const StyledItem = tw.div`
  opacity-80 hover:opacity-100
  flex items-center
  cursor-pointer
  px-4 py-2
`;

const StyledName = tw.span`
  text-xl font-normal
`;

export const ConnectedMenuItem = ({ label, onclick }) => (
  <StyledItem onClick={onclick}>
    <StyledName>{label}</StyledName>
  </StyledItem>
);
