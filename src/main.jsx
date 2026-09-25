import React from 'react'
import ReactDOM from 'react-dom/client'
import moment from 'moment'
// La versión ESM del idioma: importa la misma copia de moment (dist/moment.js)
// que resuelve Vite para "moment"; la de moment/locale/ es UMD y registraba el
// idioma en otra copia, así que las fechas seguían en inglés.
import 'moment/dist/locale/es'
import App from '@/App.jsx'
import '@/index.css'

// Fechas en castellano en toda la app ("hace 3 meses", "septiembre 2026").
// Solo afecta a nombres de mes/día y textos relativos: los formatos numéricos
// que se guardan o se envían a la AEAT (YYYY-MM-DD, DD-MM-YYYY) no cambian.
moment.locale('es')

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
