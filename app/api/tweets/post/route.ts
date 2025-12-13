import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getValidTwitterToken } from '@/lib/twitter/getValidTwitterToken'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    
    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get request body
    const body = await request.json()
    const { text } = body

    // Validate tweet text
    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Tweet text is required' },
        { status: 400 }
      )
    }

    if (text.length > 280) {
      return NextResponse.json(
        { error: 'Tweet text must be 280 characters or less' },
        { status: 400 }
      )
    }

    // Server-only token retrieval + refresh (service role client). Never refresh on client/SSR client.
    let accessToken: string
    try {
      accessToken = await getValidTwitterToken(user.id)
    } catch (e: any) {
      return NextResponse.json(
        { error: e?.message || 'Twitter account not connected. Please connect your Twitter account first.' },
        { status: 400 }
      )
    }

    // Post tweet to Twitter API
    let tweetResponse = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        text: text,
      }),
    })

    // If token was revoked/invalid but not yet expired, force-refresh and retry once.
    if (tweetResponse.status === 401) {
      try {
        accessToken = await getValidTwitterToken(user.id, { forceRefresh: true })
        tweetResponse = await fetch('https://api.twitter.com/2/tweets', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ text }),
        })
      } catch {
        // fall through and return original error below
      }
    }

    if (!tweetResponse.ok) {
      const errorData = await tweetResponse.json().catch(() => ({ error: 'Failed to post tweet' }))
      console.error('Twitter API error:', errorData)
      return NextResponse.json(
        { error: errorData.error?.message || 'Failed to post tweet to Twitter' },
        { status: tweetResponse.status }
      )
    }

    const tweetData = await tweetResponse.json()

    return NextResponse.json({
      success: true,
      tweet: tweetData.data,
    })
  } catch (error) {
    console.error('Error posting tweet:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}




