export default function ConnectMinaButton(props) {
  function connectMinaWallet() {
    console.log('connectMinaWallet');
  }

  const style =
    'inline-flex items-center border border-indigo-500 bg-indigo-500 text-white rounded-md px-4 py-2 mr-2 mt-2 mb-2 transition duration-500 ease select-none hover:bg-indigo-600 focus:outline-none focus:shadow-outline';

  return (
    <button type="button" className={style} onClick={() => connectMinaWallet()}>
      {props.children}
    </button>
  );
}
