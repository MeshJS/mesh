import tw from 'twin.macro';
import { MeshLogo } from './MeshLogo';

const StyledLink = tw.a`
  flex flex-col items-center max-w-fit p-1
  border-2 border-current border-solid rounded-md
  font-semibold text-xl text-stone-700 no-underline
`;

export const MeshBadge = () => (
  <StyledLink
    href="https://mesh.martify.io/"
    rel="noopener noreferrer"
    target="_blank"
  >
    <MeshLogo />
    Mesh
  </StyledLink>
);
