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
  font-normal
  text-xl
`;

const StyledActive = tw.span`
  ml-auto
`;

export const MenuItem = ({ icon, label, action, active }) => (
  <StyledItem onClick={action}>
    {icon && <StyledIcon src={icon} />}
    <StyledName>
      {label
        .split(' ')
        .map((word: string) => {
          return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join(' ')}
    </StyledName>
    {active && (
      <StyledActive>
        <CheckMark />
      </StyledActive>
    )}
  </StyledItem>
);
