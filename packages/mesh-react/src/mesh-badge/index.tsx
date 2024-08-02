import { MeshLogo } from "./mesh-logo";

export const MeshBadge = ({ isDark = false }) => (
  <a
    className={`ui-flex ui-max-w-fit ui-flex-col ui-items-center ui-rounded-md ui-border ui-border-solid ui-border-current ui-p-1 ui-text-xl ui-font-semibold ui-no-underline ${isDark ? `ui-bg-neutral-950	ui-text-neutral-50` : `ui-bg-neutral-50	ui-text-neutral-950`}`}
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
