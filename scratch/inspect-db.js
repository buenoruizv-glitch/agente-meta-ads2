const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Supabase URL or Service Key missing');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function inspect() {
  try {
    // 1. Get profiles
    const { data: profiles, error: pError } = await supabase.from('profiles').select('*');
    console.log('--- PROFILES ---');
    if (pError) console.error(pError);
    else console.log(profiles);

    // 2. Get clients
    const { data: clients, error: cError } = await supabase.from('clients').select('*');
    console.log('--- CLIENTS ---');
    if (cError) console.error(cError);
    else console.log(clients);

    // 3. Get recent agent execution logs
    const { data: logs, error: lError } = await supabase
      .from('agent_execution_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);
    console.log('--- RECENT AGENT LOGS ---');
    if (lError) console.error(lError);
    else console.log(logs);

  } catch (err) {
    console.error(err);
  }
}

inspect();
