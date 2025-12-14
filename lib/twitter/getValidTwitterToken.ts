import 'server-only'

import { serverClient } from '@/lib/supabase/serverClient'

type TwitterAccountRow = {
  access_token: string
  refresh_token: string | null
  expires_at: string | null
}

const TWITTER_TOKEN_ENDPOINT = 'https://api.twitter.com/2/oauth2/token'
const EXPIRY_SKEW_MS = 5 * 60 * 1000 // refresh if expiring within 5 minutes

function isNearExpiry(expiresAtIso: string | null) {
  if (!expiresAtIso) return true
  const expiresAtMs = Date.parse(expiresAtIso)
  if (Number.isNaN(expiresAtMs)) return true
  return Date.now() >= expiresAtMs - EXPIRY_SKEW_MS
}

async function refreshAccessToken(refreshToken: string) {
  const clientId = process.env.TWITTER_CLIENT_ID
  const clientSecret = process.env.TWITTER_CLIENT_SECRET

  if (!clientId) {
    throw new Error('Twitter OAuth is not configured. Missing TWITTER_CLIENT_ID.')
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  }

  // If a secret exists, use HTTP Basic. If not, assume public client (PKCE-only).
  if (clientSecret) {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
  }

  const res = await fetch(TWITTER_TOKEN_ENDPOINT, {
    method: 'POST',
    headers,
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    }),
  })

  const raw = await res.text()
  if (!res.ok) {
    let msg = raw || `Twitter token refresh failed (${res.status})`
    try {
      const parsed = JSON.parse(raw)
      msg = parsed.error_description || parsed.error || msg
    } catch {
      // ignore
    }
    throw new Error(msg)
  }

  const json = JSON.parse(raw) as {
    access_token: string
    refresh_token?: string
    expires_in?: number
    token_type?: string
    scope?: string
  }

  if (!json.access_token) {
    throw new Error('Twitter refresh response missing access_token')
  }

  const expiresAt =
    typeof json.expires_in === 'number'
      ? new Date(Date.now() + json.expires_in * 1000).toISOString()
      : null

  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token ?? null,
    expires_at: expiresAt,
  }
}

/**
 * Server-only helper that returns a valid Twitter access token for a user.
 * - Reads tokens using service role Supabase client
 * - Refreshes if expired or near expiry
 * - Persists refreshed tokens back to Supabase
 */
export async function getValidTwitterToken(
  userId: string,
  options?: { forceRefresh?: boolean }
): Promise<string> {
  const { data, error } = await serverClient
    .from('twitter_accounts')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .single()

  if (error) {
    // Common misconfig: expires_at column not added yet.
    if ((error as any).code === '42703') {
      throw new Error(
        'twitter_accounts.expires_at column is missing. Run the updated Supabase SQL migration to add expires_at.'
      )
    }
    throw new Error(error.message || 'Failed to load Twitter credentials')
  }

  const account = data as unknown as TwitterAccountRow

  if (!account?.access_token) {
    throw new Error('Twitter account not connected for this user.')
  }

  const shouldRefresh = Boolean(options?.forceRefresh) || isNearExpiry(account.expires_at)
  if (!shouldRefresh) return account.access_token

  if (!account.refresh_token) {
    throw new Error('Twitter refresh_token missing. Please reconnect your Twitter account.')
  }

  const refreshed = await refreshAccessToken(account.refresh_token)
  const nextRefreshToken = refreshed.refresh_token || account.refresh_token

  const { error: updateError } = await serverClient
    .from('twitter_accounts')
    .update({
      access_token: refreshed.access_token,
      refresh_token: nextRefreshToken,
      expires_at: refreshed.expires_at,
    })
    .eq('user_id', userId)

  if (updateError) {
    throw new Error(updateError.message || 'Failed to persist refreshed Twitter tokens')
  }

  return refreshed.access_token
}



