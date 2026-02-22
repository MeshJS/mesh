import FullWidth from "~/components/layouts/root/full-width";
import Sidebar from "./sidebar";

export default function SidebarFullwidth({
  children,
  sidebarItems,
}: {
  children: any;
  sidebarItems: { to: string; label: string }[];
}) {
  return (
    <FullWidth>
      <Sidebar sidebarItems={sidebarItems} />
      <div className="format format-blue dark:format-invert mx-auto w-full max-w-none px-4 pb-32 pt-8">
        {children}
      </div>
    </FullWidth>
  );
}
