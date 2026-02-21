import React from 'react';

export function Card({ className = '', ...props }) {
  return <div className={`glass rounded-2xl p-5 ${className}`} {...props} />;
}

export function CardHeader({ className = '', ...props }) {
  return <div className={`mb-4 ${className}`} {...props} />;
}

export function CardTitle({ className = '', ...props }) {
  return <h3 className={`section-title text-lg font-semibold ${className}`} {...props} />;
}

export function CardContent({ className = '', ...props }) {
  return <div className={className} {...props} />;
}
