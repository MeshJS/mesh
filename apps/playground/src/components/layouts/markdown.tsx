import { useEffect, useState } from "react";
import { MDXProvider } from "@mdx-js/react";

import Codeblock from "~/components/text/codeblock";
import Link from "../link";

export default function Markdown({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (mounted)
    return (
      <MDXProvider
        components={{
          //@ts-ignore
          pre: (props) => <Codeblock data={props.children.props.children} />,
          h2: (props) => (
            <h2
              id={(props.children as string)
                .replace(/[^a-z0-9]/gi, "")
                .toLowerCase()}
            >
              {props.children}
            </h2>
          ),
          //@ts-ignore
          a: (props) => <Link href={props.href}>{props.children as string}</Link>,
        }}
      >
        {children}
      </MDXProvider>
    );
}
