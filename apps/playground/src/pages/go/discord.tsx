import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { linkDiscord } from "~/data/social";

export default function Redirect() {
  const { push } = useRouter();
  useEffect(() => {
    push(linkDiscord.redirect);
  }, []);
  return <></>;
}
