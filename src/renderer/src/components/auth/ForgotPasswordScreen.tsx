import { useState } from 'react'
import { ArrowLeft, Loader2, CheckCircle } from 'lucide-react'

interface ForgotPasswordScreenProps {
  onRequestReset: (email: string) => Promise<void>
  onBack: () => void
}

export default function ForgotPasswordScreen({
  onRequestReset,
  onBack,
}: ForgotPasswordScreenProps) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return

    setLoading(true)
    setError('')

    try {
      await onRequestReset(email)
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="w-full max-w-md px-8">
        {/* Back button */}
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-8"
        >
          <ArrowLeft size={16} />
          Back to sign in
        </button>

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl mx-auto mb-4 flex items-center justify-center">
            <span className="text-white text-2xl font-bold">R</span>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">Reset your password</h1>
          <p className="text-gray-500 mt-1">
            {sent
              ? 'Check your email for a reset link'
              : "Enter your email and we'll send you a reset link"}
          </p>
        </div>

        {sent ? (
          <div className="bg-green-50 text-green-700 px-6 py-5 rounded-xl border border-green-100 text-center">
            <CheckCircle size={32} className="mx-auto mb-3 text-green-500" />
            <p className="font-medium">Email sent!</p>
            <p className="text-sm mt-1 text-green-600">
              Check your inbox for a password reset link. It may take a minute to arrive.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl border border-red-100">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                autoFocus
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading || !email}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Sending...
                </>
              ) : (
                'Send reset link'
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
