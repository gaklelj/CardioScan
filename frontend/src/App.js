import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from './ThemeContext'
import { LanguageProvider } from './LanguageContext'
import Landing from './pages/Landing'
import Analyzer from './pages/Analyzer'
import Guide from './pages/Guide'
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
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
    </LanguageProvider>
  )
}