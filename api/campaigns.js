const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bepavczocyvaegkfxtvd.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJlcGF2Y3pvY3l2YWVna2Z4dHZkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTExODU1NywiZXhwIjoyMTAwNjk0NTU3fQ.4yAo5-luUH9FWTKXS_vzKmEYGAsISrqUDN-q5XN-zM8';

const DEMO_IDS = {
  camp1: '0e4d082e-90e6-4453-a700-28e603dd87c6',
  camp2: '2d4e9c89-9ee8-4c1b-b34d-f9d8ff728e4f'
};

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost:3344'}`);
    let id = url.searchParams.get('id');

    if (id && DEMO_IDS[id]) {
      id = DEMO_IDS[id];
    }

    // GET - Fetch campaigns
    if (req.method === 'GET') {
      const endpoint = id 
        ? `${SUPABASE_URL}/rest/v1/ad_campaigns?id=eq.${encodeURIComponent(id)}&select=*`
        : `${SUPABASE_URL}/rest/v1/ad_campaigns?select=*&order=created_at.desc`;

      const response = await fetch(endpoint, {
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
        }
      });

      const data = await response.json();
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 200;
      res.end(JSON.stringify(id && Array.isArray(data) ? (data[0] || null) : data));
      return;
    }

    // POST / PATCH - Save or Update campaign
    if (req.method === 'POST') {
      let bodyData = req.body;
      if (typeof bodyData === 'string') {
        try { bodyData = JSON.parse(bodyData); } catch (e) {}
      }
      if (!bodyData) {
        // Collect buffer
        const buffers = [];
        for await (const chunk of req) {
          buffers.push(chunk);
        }
        bodyData = JSON.parse(Buffer.concat(buffers).toString() || '{}');
      }

      let targetId = bodyData.id || id;
      if (targetId && DEMO_IDS[targetId]) {
        targetId = DEMO_IDS[targetId];
      }

      if (targetId) {
        // Update existing campaign
        const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/ad_campaigns?id=eq.${encodeURIComponent(targetId)}`, {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify({
            headline: bodyData.headline || bodyData.title,
            description: bodyData.description || bodyData.copy,
            target_url: bodyData.target_url || bodyData.url,
            cta_label: bodyData.cta_label || bodyData.cta || 'Explore Offer →',
            banner_image_url: bodyData.banner_image_url || bodyData.image,
            is_active: bodyData.is_active !== undefined ? bodyData.is_active : (bodyData.status === 'Active'),
            updated_at: new Date().toISOString()
          })
        });

        const patchData = await patchRes.json();
        res.setHeader('Content-Type', 'application/json');
        res.statusCode = 200;
        res.end(JSON.stringify({ success: true, data: patchData[0] || patchData }));
        return;
      } else {
        // Insert new campaign for live platform feed
        const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/ad_campaigns`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify([{
            title: bodyData.title || bodyData.headline || 'New In-Feed Campaign',
            company_name: bodyData.company_name || 'Verified Partner',
            headline: bodyData.headline || bodyData.title,
            description: bodyData.description || bodyData.copy || '',
            target_url: bodyData.target_url || bodyData.url || 'https://womensipalliance.com',
            cta_label: bodyData.cta_label || bodyData.cta || 'Learn More',
            banner_image_url: bodyData.banner_image_url || bodyData.image || 'assets/patent_ad_creative.jpg',
            slot_placement: bodyData.slot_placement || 'feed_native',
            badge_text: bodyData.badge_text || 'Sponsored Partner',
            is_active: bodyData.is_active !== undefined ? bodyData.is_active : true,
            impressions_count: 0,
            clicks_count: 0
          }])
        });

        const insertData = await insertRes.json();
        res.setHeader('Content-Type', 'application/json');
        res.statusCode = 200;
        res.end(JSON.stringify({ success: true, data: insertData[0] || insertData }));
        return;
      }
    }

    res.statusCode = 405;
    res.end('Method Not Allowed');
  } catch (err) {
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 500;
    res.end(JSON.stringify({ error: err.message }));
  }
};
