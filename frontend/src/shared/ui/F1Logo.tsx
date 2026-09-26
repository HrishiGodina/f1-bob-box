export const F1Logo = ({ className = '', color = '#cc0000' }: { className?: string; color?: string }) => (
  <svg className={className} viewBox="0 0 150 46" fill="none" xmlns="http://www.w3.org/2000/svg">
    <g transform="translate(10,1) skewX(-10)">
      <path d="M0 0 H48 V11 H14 V18 H41 V29 H14 V44 H0 Z" fill="#ffffff" />
      <path d="M62 1 H76 V44 H62 V15 L53 19 V9 Z" fill="#ffffff" />
      <rect x="84" y="2" width="48" height="9" fill={color} />
      <rect x="84" y="17.5" width="37" height="9" fill={color} />
      <rect x="84" y="33" width="26" height="9" fill={color} />
    </g>
  </svg>
);
