const importLib = async () => {
  if (typeof window !== 'undefined') {
    return await import('@emurgo/cardano-serialization-lib-browser');
  } else {
    return await import('@emurgo/cardano-serialization-lib-nodejs');
  }
};

const resolveImport = async () => {
  try {
    return await importLib();
  } catch (error) {
    console.error(
      'An error occurred when importing the Cardano Serialization Lib package.'
    );
    throw error;
  }
};

export default await resolveImport();
