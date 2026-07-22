import type { Metadata } from 'next'
import { ThemeProvider } from 'next-themes'
import { AuthProvider } from '@/context/AuthContext'
import './globals.css'

export const metadata: Metadata = {
  title: 'Sirve',
  description: 'Sistema de gestión Sirve',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <AuthProvider>
            {children}
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
