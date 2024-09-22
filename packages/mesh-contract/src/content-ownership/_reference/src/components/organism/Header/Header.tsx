/* eslint-disable @next/next/no-img-element */
import Image from "next/image";
import Link from "next/link";
import React from "react";
import logo from "./logo.png";
import SignInButton from "../../atom/SignInButton/SignInButton";
import { CardanoWallet, useAddress, useWallet } from "@meshsdk/react";
import SignOutButton from "../../atom/SignOutButton/SignOutButton";

import UserIcon from "../../atom/UserIcon/UserIcon";
import CreateContentButton from "@/components/atom/CreateContentButton/CreateContentButton";
import Icon from "@/components/atom/icon/Icon";

function Header() {
  const { connect, connected, disconnect } = useWallet();
  const address = useAddress();

  return (
    /**
     * Returning the header component of the blog front page*/
    <header className="flex justify-between p-5 max-w-7xl mx-auto">
      <div className="items-center space-x-5 flex">
        <Link href="/">
          <Icon />
        </Link>

        <div className=" md:inline-flex  items-center space-x-5 hidden">
          <h3 className="text-black">About </h3>
          <h3 className="text-black">Contact</h3>
          <h3 className="text-white bg-green-600 rounded-full px-4 py-1">
            Follow
          </h3>
        </div>
      </div>

      <div className="flex items-center space-x-5 text-green-600">
        {!connected ? (
          <>
            <CardanoWallet />
            <h3 className=" border px-4 py-1 rounded-full border-green-600">
              Get Started
            </h3>
          </>
        ) : (
          <div className=" max-w-7xl mx-auto flex place-items-start">
            <CreateContentButton />
            <SignOutButton />
            <UserIcon />
          </div>
        )}
      </div>
    </header>
  );
}

export default Header;
