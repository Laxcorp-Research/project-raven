import { useState, useEffect } from 'react'
import { Crown, ExternalLink, Loader2, Zap, Shield, Clock, BarChart3, Sparkles } from 'lucide-react'
import { useAppMode } from '../../../hooks/useAppMode'

interface SubscriptionInfo {
  plan: string
  status: string
  currentPeriodEnd: string | null
}

interface UsageInfo {
  plan: string
  used: number
  limit: number | null
  remaining: number | null
  sessionsUsed: number
  sessionLimit: number | null
  sessionMaxSeconds: number | null
  resetAt: string | null
}

const FEATURES = [
  { icon: Zap, label: 'Unlimited AI responses' },
  { icon: Clock, label: 'Unlimited recording sessions' },
  { icon: Sparkles, label: 'Fast & Deep AI model toggle' },
  { icon: Shield, label: 'Invisible to screen sharing' },
  { icon: BarChart3, label: 'Post-meeting insights' },
]

interface BillingTabProps {
  initialSubscription?: SubscriptionInfo | null
}

export function BillingTab({ initialSubscription }: BillingTabProps = {}) {
  const { isPro } = useAppMode()
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(initialSubscription || null)
  const [usage, setUsage] = useState<UsageInfo | null>(null)
  const [interval, setInterval] = useState<'monthly' | 'yearly'>('yearly')
  const [loading, setLoading] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)
  const [ready, setReady] = useState(!!initialSubscription)

  useEffect(() => {
    async function refresh() {
      try {
        const [sub, use] = await Promise.all([
          window.raven.authGetSubscription(),
          window.raven.proxyGetUsage(),
        ])
        setSubscription(sub)
        setUsage(use)
      } catch { /* not authenticated or backend unavailable */ }
      setReady(true)
    }
    refresh()
  }, [])

  const isSubscribed = subscription?.plan === 'PRO' || subscription?.plan === 'TEAM'

  async function handleUpgrade() {
    setLoading(true)
    try {
      const result = await window.raven.authOpenCheckout('PRO', interval)
      if (!result.success) console.error('Checkout failed:', result.error)
    } catch (err) {
      console.error('Failed to open checkout:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleManageBilling() {
    setPortalLoading(true)
    try {
      const result = await window.raven.authOpenBillingPortal()
      if (!result.success) console.error('Portal failed:', result.error)
    } catch (err) {
      console.error('Failed to open billing portal:', err)
    } finally {
      setPortalLoading(false)
    }
  }

  if (!isPro) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>Billing is available in Pro mode.</p>
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    )
  }

  if (isSubscribed) {
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold text-gray-900">Your plan</h3>
          <button
            onClick={handleManageBilling}
            disabled={portalLoading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
          >
            {portalLoading ? <Loader2 size={14} className="animate-spin" /> : <>Manage <ExternalLink size={14} /></>}
          </button>
        </div>

        <div className="grid grid-cols-4 gap-6 py-4 border-b border-gray-100">
          <div>
            <p className="text-xs text-gray-500 mb-1">Your plan</p>
            <p className="font-semibold text-gray-900">Raven Pro</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Pricing</p>
            <p className="font-semibold text-gray-900">
              {subscription?.plan === 'PRO' ? '$29.99 / month' : '$24.99 / month'}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Status</p>
            <p className="font-semibold text-gray-900">
              {subscription?.status === 'ACTIVE' ? 'Active' : subscription?.status}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Next bill</p>
            <p className="font-semibold text-gray-900">
              {subscription?.currentPeriodEnd
                ? new Date(subscription.currentPeriodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                : '—'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-100 rounded-xl">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center shrink-0">
            <Crown size={20} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">You have unlimited access</p>
            <p className="text-xs text-gray-500">Unlimited AI, recordings, and session length</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold text-gray-900">Choose your Plan</h3>
        <div className="bg-gray-100 rounded-lg p-0.5 flex">
          <button
            onClick={() => setInterval('monthly')}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
              interval === 'monthly'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setInterval('yearly')}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
              interval === 'yearly'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Yearly <span className="text-green-600 font-semibold ml-1">Save 17%</span>
          </button>
        </div>
      </div>

      {/* Horizontal plan card — left: plan info, right: features */}
      <div className="border border-gray-200 rounded-2xl overflow-hidden flex">
        {/* Left — plan & pricing */}
        <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-purple-700 p-6 text-white flex flex-col justify-between" style={{ minWidth: '240px' }}>
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Crown size={18} />
              <span className="font-semibold text-sm">Raven Pro</span>
            </div>
            <div className="mb-1">
              <span className="text-4xl font-bold">
                ${interval === 'yearly' ? '24.99' : '29.99'}
              </span>
              <span className="text-white/60 text-sm ml-1">/ month</span>
            </div>
            {interval === 'yearly' ? (
              <p className="text-white/50 text-xs">$299.99/year &middot; billed annually</p>
            ) : (
              <p className="text-white/50 text-xs">Billed monthly</p>
            )}
          </div>

          <button
            onClick={handleUpgrade}
            disabled={loading}
            className="mt-6 w-full py-2.5 bg-white text-blue-700 font-semibold rounded-xl text-sm hover:bg-white/90 transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <>Get Raven Pro</>
            )}
          </button>
        </div>

        {/* Right — features */}
        <div className="flex-1 p-6">
          <p className="text-sm font-medium text-gray-900 mb-4">Everything you need for meetings:</p>
          <div className="space-y-3">
            {FEATURES.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                  <Icon size={15} className="text-blue-600" />
                </div>
                <span className="text-sm text-gray-700">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Usage stats */}
      {usage && (
        <div className="bg-gray-50 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-700">Today's Usage</h4>
            {usage.resetAt && (
              <p className="text-xs text-gray-400">
                Resets {new Date(usage.resetAt).toLocaleDateString()}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-gray-500">AI Responses</p>
                <p className="text-xs font-medium text-gray-700">{usage.used} / {usage.limit ?? '∞'}</p>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    usage.limit && usage.used >= usage.limit ? 'bg-red-500' : 'bg-blue-500'
                  }`}
                  style={{ width: `${usage.limit ? Math.min(100, (usage.used / usage.limit) * 100) : 0}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-gray-500">Sessions</p>
                <p className="text-xs font-medium text-gray-700">{usage.sessionsUsed} / {usage.sessionLimit ?? '∞'}</p>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all"
                  style={{ width: `${usage.sessionLimit ? Math.min(100, (usage.sessionsUsed / usage.sessionLimit) * 100) : 0}%` }}
                />
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-3">
            Free plan: {usage.limit ?? 5} AI responses/day &middot; {Math.floor((usage.sessionMaxSeconds ?? 120) / 60)} min max session
          </p>
        </div>
      )}
    </div>
  )
}
