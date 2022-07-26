const importCSL = async () => {
  if (typeof window !== 'undefined') {
    return await import('@emurgo/cardano-serialization-lib-browser');
  } else {
    return await import('@emurgo/cardano-serialization-lib-nodejs');
  }
};

const resolveImport = async () => {
  try {
    const {
      default: _, ...rest
    } = await importCSL();

    return rest;
  } catch (error) {
    console.error(
      'An error occurred when importing the Cardano Serialization Lib package.'
    );
    throw error;
  }
};

export const csl = await resolveImport();
