import React from "react";

export default function Icon({
  icon,
  className,
}: {
  icon: any;
  className?: string;
}) {
  if (icon) {
    if (typeof icon === "object" || typeof icon === "function") {
      return React.createElement(icon, { className: className });
    }

    if (typeof icon === "string") {
      return <img src={icon} alt={icon} className={className} />;
    }
  }

  return <></>;
}
