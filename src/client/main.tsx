import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@tabler/core/dist/css/tabler.min.css'

import { App } from './App'
import './styles.css'

createRoot(document.querySelector('#root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
