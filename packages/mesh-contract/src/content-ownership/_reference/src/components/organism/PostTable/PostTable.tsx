import React, { useEffect, useState } from "react";
import axios from "axios";

import PostCard from "@/components/atom/PostCard/PostCard";
import { useWallet } from "@meshsdk/react";
import { Post } from "@/types";

function PostTable() {
  const [data, setData] = useState<Array<any>>([]);
  const { connected } = useWallet();
  const fetchingData = async () => {
    const res = await axios.get("../api/get-content");
    setData(res.data);
  };

  useEffect(() => {
    fetchingData();
  }, [connected]);

  return (
    <div className="container">
      <div className="grid grid-cols-3 gap-4 m-4">
        {data.map((data: Post, index) => (
          <PostCard key={index} index={index} content={data.content} ownerAssetHex={data.ownerAssetHex} />
        ))}
      </div>
    </div>
  );
}

export default PostTable;
