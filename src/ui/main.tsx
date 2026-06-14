import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import 'slot-text/style.css'
import './app/app.css'

// default until config loads; ThemeEffects takes over
document.documentElement.dataset.theme = 'grid'

createRoot(document.getElementById('root')!).render(<App />)
