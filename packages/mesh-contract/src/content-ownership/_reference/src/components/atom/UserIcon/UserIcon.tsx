import React from "react";
import Image from "next/image";
import user from "./userIcon.png";
import Link from "next/link";

function UserIcon(): React.JSX.Element {
  /**To Do Get the user Icon from DB */
  return (
    <Link href="/user/page">
      <Image
        className=" object-contain cursor-pointer"
        src={user}
        alt="userIcon"
        width={25}
        height={25}
      />
    </Link>
  );
}

export default UserIcon;
