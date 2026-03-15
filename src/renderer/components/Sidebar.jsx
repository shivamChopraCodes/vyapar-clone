import React from 'react';
import { NavLink } from 'react-router-dom';

const links = [
  { to: '/', label: 'Overview' },
  { to: '/company', label: 'Company Setup' },
  { to: '/parties', label: 'Parties' },
  { to: '/items', label: 'Items & Batches' },
  { to: '/reports', label: 'Reports' },
  { to: '/ai/gemini', label: 'Gemini API' },
  { to: '/sales', label: 'Sales Orders' },
  { to: '/purchase', label: 'Purchase Orders' }
];

export default function Sidebar() {
  return (
    <aside className="sidebar p-6">
      <div className="mb-8">
        <h1 className="section-title text-2xl font-semibold">Vyapar Desk</h1>
        <p className="text-sm text-muted">Local ERP for GST & batch tracking</p>
      </div>
      <nav className="space-y-2">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              `block rounded-xl px-4 py-2 text-sm font-semibold transition ${
                isActive ? 'bg-accent text-white shadow-soft' : 'text-ink hover:bg-accentSoft'
              }`
            }
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
