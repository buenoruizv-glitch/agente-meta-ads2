const axios = require('axios');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function fetchOpenApi() {
  try {
    const response = await axios.get(supabaseUrl + '/rest/v1/', {
      headers: {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`
      }
    });
    
    const paths = Object.keys(response.data.paths);
    console.log('Exposed Paths/RPCs:');
    paths.forEach(p => console.log(p));
  } catch (err) {
    console.error('Error fetching OpenAPI spec:', err.message);
    if (err.response) {
      console.error(err.response.data);
    }
  }
}

fetchOpenApi();
