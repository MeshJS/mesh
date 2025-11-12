import React, { useState } from "react";
import { useHydra } from "./src";

const hydraProvider = () => {
  const [url, setHydraUrl] = useState("");
  const { hydra, status } = useHydra({
    httpUrl: url,
  });

  const handleInit = () => {
    hydra.connect().subscribe({
      complete() {
        hydra.init().subscribe();
      }
    });
  };
  return (
    <div>
      <button onClick={handleInit}>Init Hydra</button>
      <div>Status: {status}</div>
      <input type="text" value={url} onChange={(e) => setHydraUrl(e.target.value)} />
    </div>

  );
};

export default hydraProvider;