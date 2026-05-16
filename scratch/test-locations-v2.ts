
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { searchLocations } from '../src/lib/meta-api';

async function test() {
  const metaConfig = {
    token: process.env.META_ACCESS_TOKEN || '',
    adAccountId: process.env.META_AD_ACCOUNT_ID || ''
  };

  const locations = ['Alicante', 'Murcia'];
  
  for (const loc of locations) {
    console.log(`Searching for: ${loc}...`);
    try {
      const res = await searchLocations(loc, metaConfig);
      console.log(`Results for ${loc}:`, JSON.stringify(res.data, null, 2));
    } catch (err) {
      console.error(`Error searching ${loc}:`, err);
    }
  }
}

test();
