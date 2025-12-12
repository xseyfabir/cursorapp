// app/api/scheduled-tweets/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { serverClient } from '@/lib/supabase/serverClient'
import type { Database } from '@/src/lib/supabase.types';


type ScheduledTweet = Database['public']['Tables']['scheduled_tweets']

async function getUser() {
  const supabase = createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  return { user, error }
}

// ------------------------ POST: Create a new scheduled tweet ------------------------
export async function POST(request: NextRequest) {
  const { user, error: authError } = await getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { text, scheduled_at } = body

    // Validation
    if (!text || typeof text !== 'string' || text.length === 0 || text.length > 280) {
      return NextResponse.json({ error: 'Tweet text must be 1-280 chars' }, { status: 400 })
    }

    if (!scheduled_at) {
      return NextResponse.json({ error: 'Scheduled time required' }, { status: 400 })
    }

    const scheduledDate = new Date(scheduled_at)
    if (isNaN(scheduledDate.getTime()) || scheduledDate <= new Date()) {
      return NextResponse.json({ error: 'Scheduled time must be in the future' }, { status: 400 })
    }

    const { data: newTweet, error: insertError } = await serverClient
      .from('scheduled_tweets')
      .insert({
        text,
        scheduled_at: scheduledDate.toISOString(),
        user_id: user.id,
        status: 'pending',
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (insertError) {
      console.error('Insert error:', insertError)
      return NextResponse.json({ error: 'Failed to schedule tweet', details: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, tweet: newTweet })
  } catch (err: any) {
    console.error('POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ------------------------ PATCH: Update a scheduled tweet ------------------------
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, error: authError } = await getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const { text, scheduled_at } = body

    if (!text || typeof text !== 'string' || text.length === 0 || text.length > 280) {
      return NextResponse.json({ error: 'Tweet text must be 1-280 chars' }, { status: 400 })
    }

    if (!scheduled_at) return NextResponse.json({ error: 'Scheduled time required' }, { status: 400 })

    const scheduledDate = new Date(scheduled_at)
    if (isNaN(scheduledDate.getTime()) || scheduledDate <= new Date()) {
      return NextResponse.json({ error: 'Scheduled time must be in the future' }, { status: 400 })
    }

    const { data: existingTweet, error: fetchError } = await serverClient
      .from('scheduled_tweets')
      .select('user_id, status')
      .eq('id', params.id)
      .single()

    if (fetchError || !existingTweet) return NextResponse.json({ error: 'Tweet not found' }, { status: 404 })
    if (existingTweet.user_id !== user.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    if (existingTweet.status !== 'pending') return NextResponse.json({ error: 'Can only edit pending tweets' }, { status: 400 })

    const { error: updateError } = await serverClient
      .from('scheduled_tweets')
      .update({
        text,
        scheduled_at: scheduledDate.toISOString(),
      })
      .eq('id', params.id)
      .eq('user_id', user.id)

    if (updateError) {
      console.error('Update error:', updateError)
      return NextResponse.json({ error: 'Failed to update tweet', details: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ------------------------ DELETE: Delete a scheduled tweet ------------------------
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, error: authError } = await getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { data: existingTweet, error: fetchError } = await serverClient
      .from('scheduled_tweets')
      .select('user_id')
      .eq('id', params.id)
      .single()

    if (fetchError || !existingTweet) return NextResponse.json({ error: 'Tweet not found' }, { status: 404 })
    if (existingTweet.user_id !== user.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

    const { error: deleteError } = await serverClient
      .from('scheduled_tweets')
      .delete()
      .eq('id', params.id)
      .eq('user_id', user.id)

    if (deleteError) {
      console.error('Delete error:', deleteError)
      return NextResponse.json({ error: 'Failed to delete tweet', details: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('DELETE error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
