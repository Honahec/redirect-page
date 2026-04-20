import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { HomePage } from '@/pages/home-page'

const SettingsPage = lazy(() => import('@/pages/settings-page'))

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route
        path="/settings"
        element={
          <Suspense
            fallback={
              <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-6">
                <p className="text-sm text-stone-600">Loading settings...</p>
              </main>
            }
          >
            <SettingsPage />
          </Suspense>
        }
      />
      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  )
}

export default App
