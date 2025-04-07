import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../common/tooltip";

export default function WalletIcon({
  icon,
  name,
  action,
  iconReactNode,
  loading = false,
}: {
  icon?: string;
  name: string;
  action: () => void;
  iconReactNode?: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <Tooltip delayDuration={0} defaultOpen={false}>
      <TooltipTrigger asChild>
        <button
          className="mesh-flex mesh-items-center mesh-justify-center mesh-rounded-lg mesh-w-10 mesh-h-10 mesh-bg-neutral-50 mesh-border mesh-border-zinc-700 hover:mesh-border-zinc-200 mesh-cursor-pointer"
          onClick={action}
          disabled={loading}
        >
          {icon && !loading && (
            <img src={icon} alt={name} className="mesh-w-8 mesh-h-8" />
          )}
          {!loading && iconReactNode && iconReactNode}
          {loading && <span className="text-black">...</span>}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{name}</p>
      </TooltipContent>
    </Tooltip>
  );
}
