import type { ReactNode } from 'react';

export const StudioButton = ({ children, onClick, variant = 'primary', className = '' }: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary';
  className?: string;
}) => (
  <button
    onClick={onClick}
    className={`${variant === 'primary' ? 'mkbhd-btn-primary' : 'mkbhd-btn-secondary'} ${className} transform transition-transform hover:scale-[1.02] active:scale-[0.98]`}
  >
    {children}
  </button>
);
