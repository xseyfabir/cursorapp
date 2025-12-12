import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

    // Get user's Twitter access token
    const { data: twitterAccount, error: accountError } = await supabase
      .from('twitter_accounts')
      .select('access_token')
      .eq('user_id', user.id)
      .single()

    if (accountError || !twitterAccount) {
      return NextResponse.json(
        { error: 'Twitter account not connected. Please connect your Twitter account first.' },
        { status: 400 }
      )
    }

    // Post tweet to Twitter API
    const tweetResponse = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${twitterAccount.access_token}`,
      },
      body: JSON.stringify({
        text: text,
      }),
    })

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




