import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import { Layout } from './components/layout/Layout'
import { Dashboard } from './pages/Dashboard'
import { NewTask } from './pages/NewTask'
import { RunDetail } from './pages/RunDetail'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element not found')

createRoot(rootEl).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/new" element={<NewTask />} />
          <Route path="/runs/:runId" element={<RunDetail />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>
)
