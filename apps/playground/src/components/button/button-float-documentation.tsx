import { DocumentTextIcon } from "@heroicons/react/24/solid";

import Link from "../link";
import Button from "./button";

export default function ButtonFloatDocumentation({ href }: { href: string }) {
  return (
    <Link href={href}>
      <Button className="fixed bottom-0 left-2 z-30" tooltip="Documentation" style="info">
        <DocumentTextIcon className="h-5 w-5" />
      </Button>
    </Link>
  );
}
