/*import { useState, useEffect } from 'react';
import { Button, Card, Codeblock, Input } from '../../components';
import { ChevronRightIcon } from '@heroicons/react/solid';

import { WalletPrivateKeyService } from '@martifylabs/mesh';

const DEVTMODE = true;
const PASSWORD_LENGTH = 8;

export default function CreatePrivateKeyWallet() {
  const [state, setState] = useState<number>(0); // track tab
  const [stateCompleted, setStateCompleted] = useState<number>(0); // track user progress
  const [mnemonic, setMnemonic] = useState<string>(''); // generated
  const [userMnemonic, setUserMnemonic] = useState<{}>({}); // user input
  const [userPassword, setUserPassword] = useState<string>(''); // user input
  const [createdWallet, setCreatedWallet] = useState<{}>({}); // created wallet

  function stepState() {
    const newState = state + 1;
    setState(newState);
    if (stateCompleted < newState) {
      setStateCompleted(newState);
    }
  }

  return (
    <>
      <h2>Create a new wallet</h2>
      <p className="lead">Create a new wallet on Martify.</p>

      <NavStages
        state={state}
        setState={setState}
        stateCompleted={stateCompleted}
      />

      {state == 0 && <SectionIntro stepState={stepState} />}
      {state == 1 && (
        <SectionGetMnemonic
          stepState={stepState}
          mnemonic={mnemonic}
          setMnemonic={setMnemonic}
        />
      )}
      {state == 2 && (
        <SectionFillMnemonic
          stepState={stepState}
          mnemonic={mnemonic}
          userMnemonic={userMnemonic}
          setUserMnemonic={setUserMnemonic}
        />
      )}
      {state == 3 && (
        <SectionPassword
          stepState={stepState}
          userPassword={userPassword}
          setUserPassword={setUserPassword}
          mnemonic={mnemonic}
          setCreatedWallet={setCreatedWallet}
        />
      )}
      {state == 4 && <SectionCreated createdWallet={createdWallet} />}
    </>
  );
}

function SectionCreated({ createdWallet }) {
  return (
    <>
      <h3>Wallet created</h3>
      <p>Your wallet has been created.</p>
      <p>
        Your wallet address is <code>{createdWallet}</code>.
      </p>
    </>
  );
}

function SectionPassword({
  stepState,
  userPassword,
  setUserPassword,
  mnemonic,
  setCreatedWallet,
}) {
  const [userPasswordRepeat, setUserPasswordRepeat] = useState<string>(''); // user input

  let isValid = userPassword.length >= PASSWORD_LENGTH;

  function createWallet() {
    const paymentAddress =
      WalletPrivateKeyService.createWalletStep2WithMnemonicAndPassword(
        mnemonic,
        userPassword
      );
    setCreatedWallet(paymentAddress);
    stepState();
  }

  return (
    <>
      <h3>Set a password to encrypt your wallet</h3>
      <p>Explain why need to do that.</p>

      <div className="grid gap-6 mb-6 md:grid-cols-2">
        <div>
          <label className="block mb-2 text-sm font-medium text-gray-900 dark:text-gray-300">
            Password
          </label>
          <Input
            value={userPassword}
            onChange={(e) => setUserPassword(e.target.value)}
            placeholder={`set a password`}
            type="password"
            className={
              userPassword.length > 0
                ? isValid
                  ? 'border-green-300'
                  : 'border-red-300'
                : ''
            }
          />
        </div>
        <div>
          <label className="block mb-2 text-sm font-medium text-gray-900 dark:text-gray-300">
            Type password again
          </label>
          <Input
            value={userPasswordRepeat}
            onChange={(e) => setUserPasswordRepeat(e.target.value)}
            placeholder={`type your password again`}
            type="password"
            className={
              userPassword.length > 0
                ? isValid && userPassword == userPasswordRepeat
                  ? 'border-green-300'
                  : 'border-red-300'
                : ''
            }
          />
        </div>
      </div>

      <Button
        onClick={() => createWallet()}
        disabled={!isValid || userPassword != userPasswordRepeat}
        style={
          isValid && userPassword == userPasswordRepeat ? 'primary' : 'light'
        }
      >
        Next
      </Button>
    </>
  );
}

function SectionFillMnemonic({
  stepState,
  mnemonic,
  userMnemonic,
  setUserMnemonic,
}) {
  function updateUserMnemonic(i, value) {
    let updated = { ...userMnemonic };
    updated[i] = value;
    setUserMnemonic(updated);
  }

  let allCorrect = mnemonic
    .split(' ')
    .map((word, i) => {
      if (userMnemonic[i] && userMnemonic[i] == word) {
        return true;
      }
      return false;
    })
    .every((element) => element === true);

  useEffect(() => {
    if (DEVTMODE && Object.keys(userMnemonic).length == 0) {
      let update = {};
      mnemonic.split(' ').map((word, i) => {
        update[i] = word;
      });
      setUserMnemonic(update);
      console.log(123, 'devt mode set mnemonic');
    }
  }, []);

  return (
    <>
      <h3>Enter your wallet mnemonic</h3>
      <p>Fill in the mnemonic in the correct order</p>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-6">
        {mnemonic.split(' ').map((word, i) => {
          return (
            <div key={i}>
              <span className="p-1">{i + 1}</span>
              <span className="p-1 font-bold text-xl">
                <Input
                  value={userMnemonic[i] ? userMnemonic[i] : ''}
                  onChange={(e) => updateUserMnemonic(i, e.target.value)}
                  placeholder={`#${i + 1}`}
                  className={
                    userMnemonic[i] && userMnemonic[i].length
                      ? userMnemonic[i] == word
                        ? 'border-green-300'
                        : 'border-red-300'
                      : ''
                  }
                />
              </span>
            </div>
          );
        })}
      </div>

      <Button
        onClick={() => stepState()}
        disabled={!allCorrect}
        style={allCorrect ? 'primary' : 'light'}
      >
        Next
      </Button>
    </>
  );
}

function SectionGetMnemonic({ stepState, mnemonic, setMnemonic }) {
  function getMnemonic() {
    const mnemonic = WalletPrivateKeyService.createWalletStep1GetMnemonic();
    setMnemonic(mnemonic);
    console.log('mnemonic', mnemonic);
  }

  useEffect(() => {
    if (mnemonic === '') {
      getMnemonic();
    }
  }, []);

  return (
    <>
      <h3>Your wallet mnemonic</h3>
      <p>Tell what is Mnemonic for?</p>
      <p>Copy these on a piece of paper.</p>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-6">
        {mnemonic.split(' ').map((word, i) => {
          return (
            <div key={i}>
              <span className="p-1">{i + 1}</span>
              <span className="p-1 font-bold text-xl">
                <Input value={word} onChange={(e) => {}} disabled={true} />
              </span>
            </div>
          );
        })}
      </div>

      <Button onClick={() => stepState()}>Next</Button>
    </>
  );
}

function SectionIntro({ stepState }) {
  return (
    <>
      <h3>Introduction</h3>
      <p>Tell them about the wallet creation process.</p>
      <Button onClick={() => stepState()}>Next</Button>
    </>
  );
}

function NavStages({ state, setState, stateCompleted }) {
  const stageLabels = [
    'Intro',
    'Get Mnemonic',
    'Fill Mnemonic',
    'Set Password',
    'Complete',
  ];
  return (
    <nav
      className="flex px-5 py-3 text-gray-700 border border-gray-200 rounded-lg bg-gray-50 dark:bg-gray-800 dark:border-gray-700 not-format mb-8"
      aria-label="Breadcrumb"
    >
      <ul className="inline-flex items-center space-x-1 md:space-x-3">
        {stageLabels.map((stageLabel, i) => {
          let isClickable = stateCompleted >= i;
          let classStyle = `ml-1 text-sm text-gray-700 hover:text-gray-900 md:ml-2 dark:text-gray-400 dark:hover:text-white`;
          classStyle = `${classStyle} ${
            isClickable ? ' cursor-pointer' : 'cursor-default'
          }`;
          if (i == state) {
            classStyle = `${classStyle} font-bold`;
          }

          return (
            <li key={i}>
              <div className="flex items-center">
                <ChevronRightIcon className="w-6 h-6 text-gray-400" />
                <span
                  className={classStyle}
                  onClick={() => isClickable && setState(i)}
                >
                  {stageLabel}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
*/
export {};