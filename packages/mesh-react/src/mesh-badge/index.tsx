import { MeshLogo } from "./mesh-logo";

export const MeshBadge = ({ isDark = false }) => (
  <a
    className={`mesh-flex mesh-max-w-fit mesh-flex-col mesh-items-center mesh-rounded-md mesh-border mesh-border-solid mesh-border-current mesh-p-1 mesh-text-xl mesh-font-semibold mesh-no-underline ${isDark ? `mesh-bg-neutral-950	mesh-text-neutral-50` : `mesh-bg-neutral-50	mesh-text-neutral-950`}`}
    style={{
      color: isDark ? "#EEEEEE" : "#111111",
      backgroundColor: isDark ? "#111111" : "#EEEEEE",
    }}
    href="https://meshjs.dev/"
    rel="noopener noreferrer"
    target="_blank"
  >
    <MeshLogo />
    Mesh
  </a>
);
