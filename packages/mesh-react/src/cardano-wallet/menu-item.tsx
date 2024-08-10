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
      className="ui-flex ui-cursor-pointer ui-items-center ui-px-4 ui-py-2 ui-opacity-80 hover:ui-opacity-100 ui-h-16"
      onClick={action}
    >
      {icon && <img className="ui-pr-2 ui-m-1 ui-h-8" src={icon} />}
      <span className="ui-mr-menu-item ui-text-xl ui-font-normal ui-text-gray-700 hover:ui-text-black">
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
