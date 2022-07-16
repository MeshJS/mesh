import Link from "next/link";

const Navbar = (props) => {
  return (
    <nav className="flex justify-around py-4 bg-white/80 backdrop-blur-md shadow-md w-full fixed top-0 left-0 right-0 z-10">
      <div className="flex items-center">
        <Link href="/">
          <h3 className="text-2xl font-medium text-slate-600 cursor-pointer">
            Mesh Playground
          </h3>
        </Link>
      </div>

      <div className="flex items-center space-x-5">
        <Link
          className="flex text-gray-600 hover:text-blue-500 cursor-pointer transition-colors duration-300"
          href="/wallet"
        >
          Wallet
        </Link>
        <Link
          className="flex text-gray-600 hover:text-blue-500 cursor-pointer transition-colors duration-300"
          href="/transaction"
        >
          Transaction
        </Link>
        <Link
          className="flex text-gray-600 hover:text-blue-500 cursor-pointer transition-colors duration-300"
          href="/ipfs"
        >
          IPFS
        </Link>
      </div>
    </nav>
  );
};

export default Navbar;
