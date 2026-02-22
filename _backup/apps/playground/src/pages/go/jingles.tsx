import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Redirect() {
  const { push } = useRouter();
  useEffect(() => {
    push("https://calendar.app.google/rNhVfRbrvFcNzft47");
  }, []);
  return <></>;
}
