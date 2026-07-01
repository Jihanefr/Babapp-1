import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RATE_LIMIT = 30;
const WINDOW_SECONDS = 60;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  // Verify the JWT and get the user
  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', ''),
  );
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  // Compute the current 1-minute window bucket
  const windowStart = new Date(
    Math.floor(Date.now() / (WINDOW_SECONDS * 1000)) * (WINDOW_SECONDS * 1000),
  ).toISOString();

  // Upsert the rate limit counter — increment count if row exists
  const { data: rlData, error: rlError } = await supabase.rpc('increment_rate_limit', {
    p_user_id: user.id,
    p_action: 'send_message',
    p_window_start: windowStart,
  });

  if (rlError) {
    // Fallback: manual upsert if RPC not available yet
    const { data: existing } = await supabase
      .from('rate_limits')
      .select('count')
      .eq('user_id', user.id)
      .eq('action', 'send_message')
      .eq('window_start', windowStart)
      .single();

    const newCount = (existing?.count ?? 0) + 1;
    await supabase.from('rate_limits').upsert({
      user_id: user.id,
      action: 'send_message',
      window_start: windowStart,
      count: newCount,
    });

    if (newCount > RATE_LIMIT) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Max 30 messages per minute.' }),
        { status: 429, headers: { 'Content-Type': 'application/json' } },
      );
    }
  } else if (rlData > RATE_LIMIT) {
    return new Response(
      JSON.stringify({ error: 'Rate limit exceeded. Max 30 messages per minute.' }),
      { status: 429, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Parse and validate request body
  const body = await req.json().catch(() => null);
  if (!body?.conversation_id || !body?.content) {
    return new Response(
      JSON.stringify({ error: 'conversation_id and content are required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Insert the message
  const { data: msg, error: msgError } = await supabase
    .from('messages')
    .insert({
      conversation_id: body.conversation_id,
      sender_id: user.id,
      content: String(body.content).trim(),
    })
    .select()
    .single();

  if (msgError) {
    return new Response(
      JSON.stringify({ error: msgError.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Update conversation updated_at
  await supabase
    .from('conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', body.conversation_id);

  return new Response(JSON.stringify(msg), {
    headers: { 'Content-Type': 'application/json' },
  });
});
