import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import './app/app.css'

document.documentElement.dataset.theme = 'pinoc-editorial'

createRoot(document.getElementById('root')!).render(<App />)
