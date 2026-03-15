import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { linkTwitter } from "~/data/social";

export default function Redirect() {
  const { push } = useRouter();
  useEffect(() => {
    push(linkTwitter.redirect);
  }, []);
  return <></>;
}
