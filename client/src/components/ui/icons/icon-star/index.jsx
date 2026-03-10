import React from "react";

export default function IconStar({ size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M12 2.6l2.84 5.76 6.36.92-4.6 4.48 1.09 6.33L12 17.1 6.31 20.1l1.09-6.33-4.6-4.48 6.36-.92L12 2.6z"
        fill="#f7c548"
        opacity="0.95"
      />
    </svg>
  );
}
