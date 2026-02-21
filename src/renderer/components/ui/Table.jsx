import React from 'react';

export function Table({ className = '', ...props }) {
  return <table className={`w-full text-sm ${className}`} {...props} />;
}

export function THead({ className = '', ...props }) {
  return <thead className={`text-left text-muted ${className}`} {...props} />;
}

export function TBody({ className = '', ...props }) {
  return <tbody className={className} {...props} />;
}

export function TR({ className = '', ...props }) {
  return <tr className={`border-b border-border ${className}`} {...props} />;
}

export function TH({ className = '', ...props }) {
  return <th className={`py-2 font-semibold ${className}`} {...props} />;
}

export function TD({ className = '', ...props }) {
  return <td className={`py-2 ${className}`} {...props} />;
}
