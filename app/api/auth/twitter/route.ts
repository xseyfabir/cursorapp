import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import crypto from 'crypto'

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()
    
    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.redirect(new URL('/login?redirect=/connect-twitter', request.url))
    }

    // Generate state and code verifier for PKCE
    const state = crypto.randomBytes(32).toString('base64url')
    const codeVerifier = crypto.randomBytes(32).toString('base64url')
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url')

    // Store state and code_verifier in a secure cookie (httpOnly, sameSite)
    const response = NextResponse.redirect(getTwitterAuthUrl(state, codeChallenge))
    
    // Store state and code_verifier in cookies for verification in callback
    response.cookies.set('twitter_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
      path: '/',
    })
    
    response.cookies.set('twitter_oauth_code_verifier', codeVerifier, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
      path: '/',
    })

    return response
  } catch (error) {
    console.error('Twitter OAuth initiation error:', error)
    return NextResponse.redirect(
      new URL('/connect-twitter?error=oauth_init_failed', request.url)
    )
  }
}

function getTwitterAuthUrl(state: string, codeChallenge: string): string {
  const clientId = process.env.TWITTER_CLIENT_ID
  const redirectUri = process.env.TWITTER_REDIRECT_URI || 
    `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/auth/twitter/callback`

  if (!clientId) {
    throw new Error('TWITTER_CLIENT_ID is not set in environment variables')
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'tweet.read tweet.write users.read offline.access',
    state: state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })

  return `https://twitter.com/i/oauth2/authorize?${params.toString()}`
}

