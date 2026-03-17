import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { linkGithub } from "~/data/social";

export default function Redirect() {
  const { push } = useRouter();
  useEffect(() => {
    push(linkGithub.redirect);
  }, []);
  return <></>;
}
