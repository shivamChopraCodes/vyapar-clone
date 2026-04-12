import React from 'react';
import { Navigate, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Overview from './pages/Overview';
import Company from './pages/Company';
import Parties from './pages/Parties';
import Items from './pages/Items';
import Reports from './pages/Reports';
import Orders from './pages/Orders';
import OrderEdit from './pages/OrderEdit';
import OcrImport from './pages/OcrImport';
import GeminiPage from './pages/GeminiPage';
import BulkSales from './pages/BulkSales';
import Snapshots from './pages/Snapshots';

export default function App() {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-main p-8">
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/company" element={<Company />} />
          <Route path="/parties" element={<Parties />} />
          <Route path="/items" element={<Items />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/ai/gemini" element={<GeminiPage />} />
          <Route path="/sales" element={<Orders mode="sale" />} />
          <Route path="/sales/new" element={<OrderEdit forcedOrderType="sale" />} />
          <Route path="/sales/bulk" element={<BulkSales />} />
          <Route path="/purchase" element={<Orders mode="purchase" />} />
          <Route path="/purchase/new" element={<OrderEdit forcedOrderType="purchase" />} />
          <Route path="/orders" element={<Navigate to="/sales" replace />} />
          <Route path="/orders/new" element={<Navigate to="/sales/new" replace />} />
          <Route path="/orders/import-ocr" element={<OcrImport />} />
          <Route path="/orders/:orderId/edit" element={<OrderEdit />} />
          <Route path="/snapshots" element={<Snapshots />} />
        </Routes>
      </main>
    </div>
  );
}
