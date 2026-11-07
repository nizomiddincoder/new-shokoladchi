import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import CustomerApp from './customer/CustomerApp';
import AdminApp from './admin/AdminApp';

// Ilova: "/*" — mijoz Mini App, "/admin/*" — admin paneli
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin/*" element={<AdminApp />} />
        <Route path="/*" element={<CustomerApp />} />
      </Routes>
    </BrowserRouter>
  );
}
