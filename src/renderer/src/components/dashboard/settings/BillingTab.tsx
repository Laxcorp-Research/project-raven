import { useState, useEffect, useCallback } from 'react'
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

// After the freemium ungate, only the first two items are genuine Pro
// benefits - free users already get the Settings model/effort picker,
// stealth, and post-meeting insights (capped by the 5 AI responses/day
// and 2 min per session limits, not feature-gated). Keep the full list
// here because the heading is "Everything you need for meetings"
// not "Pro-only features" - we're enumerating what Raven does, and
// the Pro sell is the uncapped version.
const FEATURES = [
  { icon: Zap, label: 'Unlimited AI responses' },
  { icon: Clock, label: 'Record full-length meetings' },
  { icon: Sparkles, label: 'Any current model plus effort control' },
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
  // Named `billingInterval` (not `interval`) to avoid shadowing the global
  // setInterval - the old `[interval, setInterval]` pair meant calls like
  // `setInterval('monthly')` reads like the eval-adjacent timer API and
  // tripped ESLint's no-implied-eval rule.
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>('yearly')
  const [loading, setLoading] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)
  const [ready, setReady] = useState(!!initialSubscription)
  const [portalError, setPortalError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [sub, use] = await Promise.all([
        window.raven.authGetSubscription(),
        window.raven.proxyGetUsage(),
      ])
      setSubscription(sub)
      setUsage(use)
    } catch { /* not authenticated or backend unavailable */ }
    setReady(true)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Re-fetch subscription + usage when the user returns from a successful
  // Dodo checkout via the raven://billing-success deep link
  // (src/pro/main/deepLink.ts broadcasts 'billing:success' to the
  // dashboard). Without this, the plan stays "FREE" in the UI until the
  // user manually reloads.
  useEffect(() => {
    const unsubscribe = window.raven.on('billing:success', () => {
      refresh()
    })
    return unsubscribe
  }, [refresh])

  // Only the ACTIVE paid plan shows the "Your plan" view. Non-ACTIVE
  // statuses (ON_HOLD, CANCELED, INACTIVE) are effectively free-tier
  // on the backend (middleware applies free limits for anything that
  // isn't status=ACTIVE), so the user sees the upgrade view for a
  // consistent experience with actual free users.
  const isSubscribed = subscription?.plan === 'PRO' && subscription?.status === 'ACTIVE'

  // True when the user had a paid plan that's no longer ACTIVE. Used
  // to softly flavor the upgrade view ("Resume Pro" instead of the
  // first-time "Get Pro") without naming any provider or listing
  // disabled features.
  const subLapsed = subscription
    && subscription.plan !== 'FREE'
    && subscription.status !== 'ACTIVE'

  async function handleUpgrade() {
    setLoading(true)
    // Server-attributed product event. Fires BEFORE we ask the
    // main process to open the checkout - we want to capture
    // the user's intent ("clicked Upgrade") independently of
    // whether the checkout URL load actually succeeded.
    void window.raven.trackClientEvent('checkout_opened', {
      metadata: { plan: 'PRO', interval: billingInterval, surface: 'billing_tab' },
    })
    try {
      const result = await window.raven.authOpenCheckout('PRO', billingInterval)
      if (!result.success) console.error('Checkout failed:', result.error)
    } catch (err) {
      console.error('Failed to open checkout:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleManageBilling() {
    setPortalLoading(true)
    setPortalError(null)
    void window.raven.trackClientEvent('portal_opened', { metadata: { surface: 'billing_tab' } })
    try {
      const result = await window.raven.authOpenBillingPortal()
      if (!result.success) {
        console.error('Portal failed:', result.error)
        // "No billing account found" means we have plan !== FREE in
        // our DB but Dodo has no customer_id linked to this user.
        // The DB is inconsistent - most likely path back to a valid
        // state is a fresh checkout. Only do this auto-fallback for
        // lapsed users; an ACTIVE subscriber hitting this error is
        // a different kind of bug (would potentially create a
        // duplicate sub) and deserves the visible error instead.
        if (subLapsed && result.error === 'No billing account found') {
          setPortalLoading(false)
          await handleUpgrade()
          return
        }
        setPortalError(result.error || 'Could not open billing portal. Please try again or contact support.')
      }
    } catch (err) {
      console.error('Failed to open billing portal:', err)
      setPortalError(err instanceof Error ? err.message : 'Could not open billing portal. Please try again or contact support.')
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

        {portalError && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
            {portalError}
          </div>
        )}

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
            <p className="font-semibold text-gray-900">Active</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Next bill</p>
            <p className="font-semibold text-gray-900">
              {subscription?.currentPeriodEnd
                ? new Date(subscription.currentPeriodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                : '-'}
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
      {/* Neutral one-line note for users whose paid subscription lapsed.
          Deliberately avoids provider names and "feature disabled" lists. */}
      {subLapsed && (
        <p className="text-sm text-gray-600">
          Your last payment didn&apos;t go through. Resume Raven Pro to restore your benefits.
        </p>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold text-gray-900">
          {subLapsed ? 'Resume your Plan' : 'Choose your Plan'}
        </h3>
        {/* Monthly/Yearly toggle is only meaningful for first-time
            buyers. A lapsed user clicking "Resume" goes to the Dodo
            customer portal, which uses their EXISTING subscription's
            interval - our toggle here would be pure visual
            misdirection. Hiding it for the lapsed path. */}
        {!subLapsed && (
          <div className="bg-gray-100 rounded-lg p-0.5 flex">
            <button
              onClick={() => setBillingInterval('monthly')}
              className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
                billingInterval === 'monthly'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingInterval('yearly')}
              className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
                billingInterval === 'yearly'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Yearly <span className="text-green-600 font-semibold ml-1">Save 17%</span>
            </button>
          </div>
        )}
      </div>

      {/* Horizontal plan card - left: plan info, right: features.
          Two variants:
          - subLapsed: no price shown (we don't know the user's actual
            interval from /api/billing/status - it could be monthly or
            yearly - so showing either would mislead). Button opens the
            Dodo customer portal, which shows the authoritative plan.
          - first-time: full plan picker with pricing driven by the
            monthly/yearly toggle above. */}
      <div className="border border-gray-200 rounded-2xl overflow-hidden flex">
        <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-purple-700 p-6 text-white flex flex-col justify-between" style={{ minWidth: '240px' }}>
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Crown size={18} />
              <span className="font-semibold text-sm">Raven Pro</span>
            </div>
            {subLapsed ? (
              <div>
                <p className="text-sm font-medium text-white/90">Your subscription is paused</p>
                <p className="text-xs text-white/60 mt-1">Resume to restore full access to Raven Pro.</p>
              </div>
            ) : (
              <div className="mb-1">
                <span className="text-4xl font-bold">
                  ${billingInterval === 'yearly' ? '24.99' : '29.99'}
                </span>
                <span className="text-white/60 text-sm ml-1">/ month</span>
                {billingInterval === 'yearly' ? (
                  <p className="text-white/50 text-xs mt-1">$299.99/year &middot; billed annually</p>
                ) : (
                  <p className="text-white/50 text-xs mt-1">Billed monthly</p>
                )}
              </div>
            )}
          </div>

          <button
            onClick={subLapsed ? handleManageBilling : handleUpgrade}
            disabled={subLapsed ? portalLoading : loading}
            className="mt-6 w-full py-2.5 bg-white text-blue-700 font-semibold rounded-xl text-sm hover:bg-white/90 transition-all flex items-center justify-center gap-2"
          >
            {(subLapsed ? portalLoading : loading) ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <>{subLapsed ? 'Resume Raven Pro' : 'Get Raven Pro'}</>
            )}
          </button>
          {portalError && subLapsed && (
            <p className="mt-2 text-xs text-red-200 bg-red-900/40 rounded-md px-2 py-1.5">
              {portalError}
            </p>
          )}
        </div>

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
          {/* Sessions widget is suppressed when sessionLimit is null -
              backend exposes null whenever there's no meaningful daily
              cap (both PRO and FREE tiers use this signal now that
              session count was decoupled from the arbitrary 999
              defensive ceiling). The progress bar would render at 0%
              forever and "sessionsUsed / infinity" is just noise.
              Drops the grid back to a single column so the AI
              Responses widget doesn't hang next to an empty slot. */}
          <div className={`grid gap-6 ${usage.sessionLimit !== null ? 'grid-cols-2' : 'grid-cols-1'}`}>
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
            {usage.sessionLimit !== null && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-gray-500">Sessions</p>
                  <p className="text-xs font-medium text-gray-700">{usage.sessionsUsed} / {usage.sessionLimit}</p>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all"
                    style={{ width: `${Math.min(100, (usage.sessionsUsed / usage.sessionLimit) * 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-3">
            Free plan: {usage.limit ?? 5} AI responses/day &middot; {Math.floor((usage.sessionMaxSeconds ?? 120) / 60)} min max session
          </p>
        </div>
      )}
    </div>
  )
}
