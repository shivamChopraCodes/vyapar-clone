import React from 'react';

export default function Label({ className = '', ...props }) {
  return (
    <label className={`text-xs font-semibold uppercase tracking-wide text-muted ${className}`} {...props} />
  );
}
