export function MenuItem({
  icon,
  label,
  action,
  active,
}: {
  icon?: string;
  label: string;
  action: () => void;
  active: boolean;
}) {
  return (
    <div
      className="mesh-flex mesh-cursor-pointer mesh-items-center mesh-px-4 mesh-py-2 mesh-opacity-80 hover:mesh-opacity-100 mesh-h-16"
      onClick={action}
    >
      {icon && <img className="mesh-pr-2 mesh-m-1 mesh-h-8" src={icon} />}
      <span className="mesh-mr-menu-item mesh-text-xl mesh-font-normal mesh-text-gray-700 hover:mesh-text-black">
        {label
          .split(" ")
          .map((word: string) => {
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
          })
          .join(" ")}
      </span>
    </div>
  );
}
