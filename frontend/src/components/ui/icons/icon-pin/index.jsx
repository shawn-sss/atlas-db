import React from "react";

export default function IconPin({ size = 10, color = "#ef4444" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle cx="12" cy="6" r="3.2" fill={color} opacity="0.95" />
      <path
        d="M8.9 9.1h6.2l-1.2 4.6h-3.8l-1.2-4.6z"
        fill={color}
        opacity="0.95"
      />
      <path
        d="M12 13.7v6"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
