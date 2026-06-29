import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import Landing from './pages/Landing'
import Chat from './pages/Chat'
import Admin from './pages/Admin'

function AnimatedRoutes() {
  const location = useLocation()
  
  const pageTransition = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1.0] }
  }

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={
          <motion.div {...pageTransition}>
            <Landing />
          </motion.div>
        } />
        <Route path="/chat" element={
          <motion.div {...pageTransition} className="h-screen overflow-hidden">
            <Chat />
          </motion.div>
        } />
        <Route path="/admin" element={
          <motion.div {...pageTransition} className="min-h-screen">
            <Admin />
          </motion.div>
        } />
      </Routes>
    </AnimatePresence>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AnimatedRoutes />
    </BrowserRouter>
  )
}
