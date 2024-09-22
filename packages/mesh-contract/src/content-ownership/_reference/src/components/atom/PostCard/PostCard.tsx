import React from "react";
import { Content } from "../../../types";
import Link from "next/link";

function PostCard({
  ownerAssetHex,
  content,
  index,
}: {
  ownerAssetHex: string;
  content: Content;
  index: number;
}) {
  return (
    <Link href={"/contentDetail/" + index}>
      <div className="container flex flex-col bg-blue-500">
        <div>image</div>
        <div>Content Number:{index}</div>
        <div>Description:{content.description}</div>
        <div>Author:{ownerAssetHex}</div>
      </div>
    </Link>
  );
}

export default PostCard;
