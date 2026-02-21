import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Overview from './pages/Overview';
import Company from './pages/Company';
import Parties from './pages/Parties';
import Items from './pages/Items';
import Orders from './pages/Orders';
import OrderEdit from './pages/OrderEdit';

export default function App() {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="p-8">
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/company" element={<Company />} />
          <Route path="/parties" element={<Parties />} />
          <Route path="/items" element={<Items />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/orders/new" element={<OrderEdit />} />
          <Route path="/orders/:orderId/edit" element={<OrderEdit />} />
        </Routes>
      </main>
    </div>
  );
}
