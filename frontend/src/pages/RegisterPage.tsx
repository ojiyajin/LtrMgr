import { Navigate } from 'react-router-dom'

// Registration is now handled inside LoginPage (Secure mode toggle).
export function RegisterPage() {
  return <Navigate to="/login" replace />
}
