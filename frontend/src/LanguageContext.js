import { createContext, useContext, useState } from 'react'
import translations from './translations'

const LanguageContext = createContext(null)

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'ru')

  const switchLang = (l) => {
    setLang(l)
    localStorage.setItem('lang', l)
  }

  const t = (key) => translations[lang]?.[key] ?? translations.en[key] ?? key

  return (
    <LanguageContext.Provider value={{ lang, switchLang, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}
