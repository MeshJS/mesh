import { useEffect } from "react";
import { useRouter } from "next/router";

var Scroll = require("react-scroll");
var scroller = Scroll.scroller;

export default function Scroller() {
  const router = useRouter();

  useEffect(() => {
    const splitedUrl = router.asPath.split("#");
    if (splitedUrl.length === 2) {
      scroller.scrollTo(splitedUrl[1], {
        duration: 500,
        delay: 100,
        smooth: true,
        offset: 0,
      });
    }
  }, [router.asPath]);

  return <></>;
}
