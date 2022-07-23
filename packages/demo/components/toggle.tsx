import { Switch } from "@headlessui/react";

const Toggle = ({ value, onChange }) => {
  return (
    <Switch
      checked={value}
      onChange={onChange}
      className={`${
        value ? "bg-green-500" : "bg-gray-500"
      } relative inline-flex h-6 w-11 items-center rounded-full`}
    >
      <span
        className={`${
          value ? "translate-x-6" : "translate-x-1"
        } inline-block h-4 w-4 transform rounded-full bg-white`}
      />
    </Switch>
  );
};

export default Toggle;
