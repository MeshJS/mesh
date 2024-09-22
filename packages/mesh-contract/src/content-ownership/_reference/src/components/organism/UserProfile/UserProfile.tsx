import TextField from "@/components/atom/Textfield/Textfield";
import React from "react";

function UserProfile() {
  return (
    <div className="py-10 lg:py-0">
      <TextField label="User Name" />
      <TextField label="User ID" />
    </div>
  );
}

export default UserProfile;
