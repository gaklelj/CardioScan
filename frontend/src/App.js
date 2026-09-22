import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from './ThemeContext'
import { LanguageProvider } from './LanguageContext'
import Landing from './pages/Landing'
import Analyzer from './pages/Analyzer'
import Guide from './pages/Guide'
import SerialMonitor from './pages/SerialMonitor'
import './index.css'

export default function App() {
  return (
    <LanguageProvider>
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/analyze" element={<Analyzer />} />
          <Route path="/guide" element={<Guide />} />
          <Route path="/serial" element={<SerialMonitor />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
    </LanguageProvider>
  )
}