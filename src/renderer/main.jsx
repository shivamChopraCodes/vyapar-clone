import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { installInvoiceMarkupBridge } from './utils/invoiceMarkup.jsx';
import './index.css';

// Lets the main process render an invoice through the same InvoicePrint component the app uses,
// which is how the Telegram bot produces its PDF without a second invoice layout.
installInvoiceMarkupBridge();

const root = createRoot(document.getElementById('root'));
root.render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
