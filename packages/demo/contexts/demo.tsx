import React, {
  createContext,
  useState,
  useContext,
  useMemo,
  useEffect,
} from 'react';
import useLocalStorage from '../hooks/useLocalStorage';

const DemoContext = createContext({
  userStorage: { lockedAssetUnit: '' },
  updateUserStorage: (key, value) => {},
});

export const DemoProvider = ({ children }) => {
  const [userLocalStorage, setUserlocalStorage] = useLocalStorage(
    'meshUserStorage',
    {}
  );
  const [userStorage, setUserStorage] =
    useState<{ lockedAssetUnit: '' }>(userLocalStorage);

  function updateUserStorage(key, value) {
    let updateUserStorage = { ...userStorage };
    if (value) {
      updateUserStorage[key] = value;
    } else {
      delete updateUserStorage[key];
    }
    setUserStorage(updateUserStorage);
    setUserlocalStorage(updateUserStorage);
  }

  const memoedValue = useMemo(
    () => ({
      userStorage,
      updateUserStorage,
    }),
    [userStorage, updateUserStorage]
  );

  return (
    <DemoContext.Provider value={memoedValue}>{children}</DemoContext.Provider>
  );
};

export default function useDemo() {
  return useContext(DemoContext);
}
