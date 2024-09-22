import Link from "next/link";
import React from "react";

function CreateContentButton() {
  return (
    <Link href="/new-content" className="px-5">
      <h3>Create Content</h3>
    </Link>
  );
}

export default CreateContentButton;
