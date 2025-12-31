import React from "react";

export default function IconStartDoc({ size = 14 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M6 3h10l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 3v5h5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 12h6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M9 16h6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <g transform="translate(9.8 0.8) scale(0.58)">
        <path
          d="M12 2.6l2.84 5.76 6.36.92-4.6 4.48 1.09 6.33L12 17.1 6.31 20.1l1.09-6.33-4.6-4.48 6.36-.92L12 2.6z"
          fill="#f7c548"
          opacity="0.95"
        />
      </g>
    </svg>
  );
}
