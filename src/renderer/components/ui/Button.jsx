import React from 'react';

export default function Button({ variant = 'default', className = '', ...props }) {
  const base = 'inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition';
  const variants = {
    default: 'bg-accent text-white hover:opacity-90 shadow-soft',
    outline: 'border border-border text-ink hover:bg-accentSoft',
    ghost: 'text-ink hover:bg-accentSoft'
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props} />
  );
}
