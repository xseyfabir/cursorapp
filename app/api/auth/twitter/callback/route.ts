import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { serverClient } from '@/lib/supabase/serverClient'
import { Database } from '@/src/lib/supabase.types'
import crypto from 'crypto'

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()
    
    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.redirect(new URL('/login?redirect=/connect-twitter', request.url))
    }

    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    // Handle OAuth errors
    if (error) {
      return NextResponse.redirect(
        new URL(`/connect-twitter?error=${error}`, request.url)
      )
    }

    // Verify state parameter
    const storedState = request.cookies.get('twitter_oauth_state')?.value
    const codeVerifier = request.cookies.get('twitter_oauth_code_verifier')?.value

    if (!state || !storedState || state !== storedState) {
      return NextResponse.redirect(
        new URL('/connect-twitter?error=invalid_state', request.url)
      )
    }

    if (!code || !codeVerifier) {
      return NextResponse.redirect(
        new URL('/connect-twitter?error=missing_code', request.url)
      )
    }

    // Exchange authorization code for access token
    let tokenResponse
    try {
      tokenResponse = await exchangeCodeForToken(code, codeVerifier)
    } catch (error: any) {
      console.error('Token exchange error:', error)
      const errorMessage = encodeURIComponent(error.message || 'Token exchange failed')
      return NextResponse.redirect(
        new URL(`/connect-twitter?error=token_exchange_failed&details=${errorMessage}`, request.url)
      )
    }
    
    if (!tokenResponse?.access_token) {
      console.error('No access token in response:', tokenResponse)
      return NextResponse.redirect(
        new URL('/connect-twitter?error=token_exchange_failed', request.url)
      )
    }

    // Get Twitter user info
    const twitterUser = await getTwitterUserInfo(tokenResponse.access_token)

    // Store tokens in Supabase twitter_accounts table using service role client
    // This bypasses RLS and allows secure storage of sensitive tokens
    
    // First, try to check if record exists
    const { data: existingRecord } = await serverClient
      .from('twitter_accounts')
      .select('user_id')
      .eq('user_id', user.id)
      .single()

    let dbError
    
    if (existingRecord) {
      // Update existing record
      const { error: updateError } = await serverClient
        .from('twitter_accounts')
        .update({
          access_token: tokenResponse.access_token,
          refresh_token: tokenResponse.refresh_token || null,
        })
        .eq('user_id', user.id)
      
      dbError = updateError
    } else {
      // Insert new record
      const { error: insertError } = await serverClient
        .from('twitter_accounts')
        .insert({
          user_id: user.id,
          access_token: tokenResponse.access_token,
          refresh_token: tokenResponse.refresh_token || null,
          created_at: new Date().toISOString(),
        })
      
      dbError = insertError
    }

    if (dbError) {
      console.error('Database error details:', {
        code: dbError.code,
        message: dbError.message,
        details: dbError.details,
        hint: dbError.hint,
        user_id: user.id,
      })
      
      // Provide more specific error message
      let errorMessage = 'storage_failed'
      if (dbError.code === '42P01') {
        errorMessage = 'storage_failed_table_missing'
      } else if (dbError.code === '42501') {
        errorMessage = 'storage_failed_permission_denied'
      } else if (dbError.message) {
        errorMessage = `storage_failed&details=${encodeURIComponent(dbError.message)}`
      }
      
      return NextResponse.redirect(
        new URL(`/connect-twitter?error=${errorMessage}`, request.url)
      )
    }

    // Clear OAuth cookies
    const response = NextResponse.redirect(new URL('/connect-twitter?success=true', request.url))
    response.cookies.delete('twitter_oauth_state')
    response.cookies.delete('twitter_oauth_code_verifier')

    return response
  } catch (error) {
    console.error('Twitter OAuth callback error:', error)
    return NextResponse.redirect(
      new URL('/connect-twitter?error=callback_failed', request.url)
    )
  }
}

async function exchangeCodeForToken(code: string, codeVerifier: string) {
  const clientId = process.env.TWITTER_CLIENT_ID
  const clientSecret = process.env.TWITTER_CLIENT_SECRET
  const redirectUri = process.env.TWITTER_REDIRECT_URI || 
    `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/auth/twitter/callback`

  if (!clientId || !clientSecret) {
    throw new Error('Twitter OAuth credentials are not configured. Please set TWITTER_CLIENT_ID and TWITTER_CLIENT_SECRET in your environment variables.')
  }

  const response = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      code: code,
      grant_type: 'authorization_code',
      client_id: clientId,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    let errorMessage = 'Token exchange failed'
    try {
      const errorJson = JSON.parse(errorText)
      errorMessage = errorJson.error_description || errorJson.error || errorMessage
    } catch {
      errorMessage = errorText || errorMessage
    }
    console.error('Twitter token exchange error:', {
      status: response.status,
      statusText: response.statusText,
      error: errorMessage,
      redirectUri,
    })
    throw new Error(errorMessage)
  }

  return await response.json()
}

async function getTwitterUserInfo(accessToken: string) {
  try {
    const response = await fetch('https://api.twitter.com/2/users/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      return null
    }

    const data = await response.json()
    return data.data || null
  } catch (error) {
    console.error('Error fetching Twitter user info:', error)
    return null
  }
}

