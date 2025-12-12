import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const body = await request.json()
    const { text, scheduled_at } = body

    // Validate input
    if (!text || typeof text !== 'string' || text.length === 0 || text.length > 280) {
      return NextResponse.json(
        { error: 'Tweet text must be between 1 and 280 characters' },
        { status: 400 }
      )
    }

    if (!scheduled_at) {
      return NextResponse.json(
        { error: 'Scheduled date and time is required' },
        { status: 400 }
      )
    }

    const scheduledDate = new Date(scheduled_at)
    if (isNaN(scheduledDate.getTime()) || scheduledDate <= new Date()) {
      return NextResponse.json(
        { error: 'Scheduled time must be in the future' },
        { status: 400 }
      )
    }

    // Check if tweet exists and belongs to user
    const { data: existingTweet, error: fetchError } = await supabase
      .from('scheduled_tweets')
      .select('user_id, status')
      .eq('id', params.id)
      .single()

    if (fetchError || !existingTweet) {
      return NextResponse.json(
        { error: 'Tweet not found' },
        { status: 404 }
      )
    }

    if (existingTweet.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    // Only allow editing pending tweets
    if (existingTweet.status !== 'pending') {
      return NextResponse.json(
        { error: 'Can only edit pending tweets' },
        { status: 400 }
      )
    }

    // Update the tweet
    const { error: updateError } = await supabase
      .from('scheduled_tweets')
      .update({
        text,
        scheduled_at: scheduledDate.toISOString(),
      })
      .eq('id', params.id)
      .eq('user_id', user.id)

    if (updateError) {
      console.error('Update error:', updateError)
      return NextResponse.json(
        { error: 'Failed to update tweet', details: updateError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error updating tweet:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    // Check if tweet exists and belongs to user
    const { data: existingTweet, error: fetchError } = await supabase
      .from('scheduled_tweets')
      .select('user_id')
      .eq('id', params.id)
      .single()

    if (fetchError || !existingTweet) {
      return NextResponse.json(
        { error: 'Tweet not found' },
        { status: 404 }
      )
    }

    if (existingTweet.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    // Delete the tweet
    const { error: deleteError } = await supabase
      .from('scheduled_tweets')
      .delete()
      .eq('id', params.id)
      .eq('user_id', user.id)

    if (deleteError) {
      console.error('Delete error:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete tweet', details: deleteError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting tweet:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

