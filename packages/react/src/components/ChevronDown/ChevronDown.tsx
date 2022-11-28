import tw from 'twin.macro';

const StyledChevronDown = tw.svg`h-6 m-2`;

export const ChevronDown = () => (
  <StyledChevronDown
    fill="none"
    aria-hidden="true"
    viewBox="0 0 24 24"
    stroke="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="M19 9l-7 7-7-7"
    />
  </StyledChevronDown>
);
