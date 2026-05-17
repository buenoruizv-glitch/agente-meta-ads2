const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function listTables() {
  try {
    const { data, error } = await supabase.rpc('get_tables');
    if (error) {
      // If the RPC doesn't exist, query pg_catalog
      const { data: tables, error: sqlError } = await supabase.from('pg_tables').select('tablename').eq('schemaname', 'public');
      if (sqlError) {
        // Try direct SQL query or listing from a table we know exists
        console.error('Error querying tables:', sqlError);
        
        // Let's try querying standard tables to see which ones fail/succeed
        const checkTables = ['profiles', 'clients', 'campaigns', 'automation_rules', 'automation_logs', 'agent_execution_logs'];
        for (const t of checkTables) {
          const { error: tErr } = await supabase.from(t).select('*').limit(1);
          console.log(`Table '${t}':`, tErr ? `FAIL (${tErr.message})` : 'OK');
        }
      } else {
        console.log('Tables:', tables.map(t => t.tablename));
      }
    } else {
      console.log('Tables (RPC):', data);
    }
  } catch (err) {
    console.error(err);
  }
}

listTables();
