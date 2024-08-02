import { PlayIcon } from "@heroicons/react/24/solid";

import Button from "./button";

export default function RunDemoButton({
  runFunction,
  loading,
  response,
  label = "Run code snippet",
  disabled = false,
}: {
  runFunction: () => void;
  loading: boolean;
  response: any;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <Button
      onClick={() => runFunction()}
      style={loading ? "warning" : response !== null ? "success" : "light"}
      disabled={loading || disabled}
    >
      {label} <PlayIcon className="ml-4 h-8 w-4" />
    </Button>
  );
}
