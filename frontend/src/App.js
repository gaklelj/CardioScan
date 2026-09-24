import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { ThemeProvider } from './ThemeContext'
import { LanguageProvider } from './LanguageContext'
import { usePlatform } from './hooks/usePlatform'
import Landing from './pages/Landing'
import IOSHome from './pages/IOSHome'
import Analyzer from './pages/Analyzer'
import Guide from './pages/Guide'
import SerialMonitor from './pages/SerialMonitor'
import History from './pages/History'
import IOSTabBar from './components/IOSTabBar'
import './index.css'
import './studio.css'

function IOSAnalyzerWrapper() {
  return <Analyzer ios />
}
function IOSGuideWrapper() {
  return <Guide ios />
}

function AppRoutes() {
  const { isIOS } = usePlatform()
  const location = useLocation()

  // iOS: show tab bar only on main tabs
  const tabRoutes = ['/', '/analyze', '/guide', '/history']
  const showTabBar = isIOS && tabRoutes.includes(location.pathname)

  if (isIOS) {
    return (
      <div className="ios-root">
        <Routes>
          <Route path="/"        element={<IOSHome />} />
          <Route path="/analyze" element={<IOSAnalyzerWrapper />} />
          <Route path="/guide"   element={<IOSGuideWrapper />} />
          <Route path="/serial"  element={<SerialMonitor />} />
          <Route path="/history" element={<History />} />
        </Routes>
        {showTabBar && <IOSTabBar />}
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/"        element={<Landing />} />
      <Route path="/analyze" element={<Analyzer />} />
      <Route path="/guide"   element={<Guide />} />
      <Route path="/serial"  element={<SerialMonitor />} />
      <Route path="/history" element={<History />} />
    </Routes>
  )
}

export default function App() {
  return (
    <LanguageProvider>
      <ThemeProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ThemeProvider>
    </LanguageProvider>
  )
}
