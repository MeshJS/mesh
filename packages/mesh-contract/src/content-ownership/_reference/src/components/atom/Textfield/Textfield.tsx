// components/common/TextField.tsx
import React, { InputHTMLAttributes } from "react";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

const TextField: React.FC<TextFieldProps> = ({ label, ...props }) => {
  return (
    <div className="mb-4">
      {label && (
        <label className="block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <input
        className="mt-1 p-2 border rounded-md w-full focus:outline-none focus:ring focus:border-blue-300"
        {...props}
      />
    </div>
  );
};

export default TextField;
