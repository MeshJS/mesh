import { useState, useEffect } from 'react';

const WindowTest = ({}) => {
  function close() {
    const message = {
      target: "meshLogin",
      data: true,
    }
    window.opener.postMessage(message, '*');
    window.close();
  }
  return (
    <div>
      hi

      login....
      <button type="button" onClick={() => close()}>
        close
      </button>
    </div>
  );
};

export default WindowTest;
