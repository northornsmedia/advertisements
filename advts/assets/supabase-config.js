/**
 * WIPA ADS - Supabase Live Database Configuration & Client Helper
 * Connects directly to WIPA's production database (bepavczocyvaegkfxtvd.supabase.co)
 */

const WIPA_SUPABASE_CONFIG = {
  url: 'https://bepavczocyvaegkfxtvd.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJlcGF2Y3pvY3l2YWVna2Z4dHZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxMTg1NTcsImV4cCI6MjEwMDY5NDU1N30.-i3uVvZyjtKfcyzRCiTX4E3UbCkaDin94T_BQeXeBro',
  demoCampaignId: '0e4d082e-90e6-4453-a700-28e603dd87c6',
  demoSecondaryId: '2d4e9c89-9ee8-4c1b-b34d-f9d8ff728e4f'
};

let _supabaseInstance = null;

function getSupabaseClient() {
  if (_supabaseInstance) return _supabaseInstance;
  if (typeof window !== 'undefined' && window.supabase && window.supabase.createClient) {
    _supabaseInstance = window.supabase.createClient(WIPA_SUPABASE_CONFIG.url, WIPA_SUPABASE_CONFIG.anonKey);
    return _supabaseInstance;
  }
  return null;
}

// Session & Authentication Helper
function getWipaAuth() {
  const mode = sessionStorage.getItem('wipa_auth_mode') || (sessionStorage.getItem('wipa_auth_name') ? 'demo' : null);
  const name = sessionStorage.getItem('wipa_auth_name') || 'Global Tech';
  const email = sessionStorage.getItem('wipa_auth_email') || '';
  const userId = sessionStorage.getItem('wipa_user_id') || '';
  const isDemo = (mode === 'demo' || name === 'Global Tech' || !mode);

  return {
    isLoggedIn: !!sessionStorage.getItem('wipa_auth_name') || !!sessionStorage.getItem('wipa_auth_mode'),
    isDemo: isDemo,
    mode: isDemo ? 'demo' : 'live',
    name: name,
    email: email,
    userId: userId
  };
}

function setWipaAuthDemo(name = 'Global Tech') {
  sessionStorage.setItem('wipa_auth_mode', 'demo');
  sessionStorage.setItem('wipa_auth_name', name);
  sessionStorage.setItem('wipa_is_demo', 'true');
  sessionStorage.removeItem('wipa_auth_email');
}

function setWipaAuthLive(user, companyName) {
  sessionStorage.setItem('wipa_auth_mode', 'live');
  sessionStorage.setItem('wipa_auth_name', companyName || user.user_metadata?.full_name || user.email.split('@')[0]);
  sessionStorage.setItem('wipa_auth_email', user.email);
  sessionStorage.setItem('wipa_user_id', user.id);
  sessionStorage.setItem('wipa_is_demo', 'false');
}

function clearWipaAuth() {
  sessionStorage.removeItem('wipa_auth_mode');
  sessionStorage.removeItem('wipa_auth_name');
  sessionStorage.removeItem('wipa_auth_email');
  sessionStorage.removeItem('wipa_user_id');
  sessionStorage.removeItem('wipa_is_demo');
}

// Load Campaigns from Supabase or Backend API for the current advertiser
async function fetchCampaigns() {
  const sb = getSupabaseClient();
  const auth = getWipaAuth();
  const companyName = auth.name || 'Global Tech';

  // 1. If logged in as Global Tech (demo/partner account 1 / 1)
  if (companyName === 'Global Tech') {
    try {
      if (sb) {
        const { data, error } = await sb
          .from('ad_campaigns')
          .select('*')
          .ilike('company_name', '%Global Tech%')
          .order('created_at', { ascending: false });
        if (!error && data && data.length > 0) return data;
      }
      const res = await fetch('/api/campaigns?company=Global%20Tech');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) return data;
      }
    } catch (e) {}

    return [
      {
        id: WIPA_SUPABASE_CONFIG.demoCampaignId,
        company_name: 'Global Tech',
        title: 'Global Patent Practice & AI Innovation Suite',
        headline: 'Global Patent Practice & AI Innovation Banner',
        description: 'Leading strategic advisory and European IP litigation for high-growth tech innovators.',
        cta_label: 'Explore Offer →',
        target_url: 'https://globalpatents.law/ai-practice',
        banner_image_url: 'assets/patent_ad_creative.jpg',
        slot_placement: 'feed_native',
        is_active: true,
        impressions_count: 3820,
        clicks_count: 168
      }
    ];
  }

  // 2. Real registered advertiser (e.g. INTA or user email)
  try {
    if (sb) {
      const { data, error } = await sb
        .from('ad_campaigns')
        .select('*')
        .ilike('company_name', `%${companyName}%`)
        .order('created_at', { ascending: false });

      if (!error && Array.isArray(data)) {
        return data; // Return exact campaigns for this advertiser (or empty [] if brand new)
      }
    }

    const res = await fetch(`/api/campaigns?company=${encodeURIComponent(companyName)}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) return data;
    }
  } catch (e) {
    console.warn('Campaign fetch error:', e);
  }

  // Check if this advertiser created campaigns stored locally under their name
  const saved = JSON.parse(localStorage.getItem(`wipa_campaigns_${companyName}`) || '[]');
  if (Array.isArray(saved) && saved.length > 0) {
    return saved;
  }

  // Brand new user has 0 campaigns - return empty array! Do NOT show mock campaigns!
  return [];
}

// Fetch single campaign by ID
async function fetchCampaignById(id) {
  if (!id) return null;

  // Handle aliases
  if (id === 'camp1') id = WIPA_SUPABASE_CONFIG.demoCampaignId;
  if (id === 'camp2') id = WIPA_SUPABASE_CONFIG.demoSecondaryId;

  const sb = getSupabaseClient();
  try {
    if (sb) {
      const { data, error } = await sb.from('ad_campaigns').select('*').eq('id', id).single();
      if (!error && data) return data;
    }

    const res = await fetch(`/api/campaigns?id=${encodeURIComponent(id)}`);
    if (res.ok) {
      const data = await res.json();
      if (data && !data.error) return data;
    }
  } catch (e) {
    console.warn('Single campaign fetch error:', e);
  }

  // Check all campaigns
  const all = await fetchCampaigns();
  return all.find(c => c.id === id || c.id === WIPA_SUPABASE_CONFIG.demoCampaignId) || all[0];
}

// Save or Update Campaign in Supabase
async function saveCampaignToDb(campaign) {
  try {
    const res = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(campaign)
    });

    if (res.ok) {
      const result = await res.json();
      const savedItem = (result && result.data) || campaign;
      const cName = campaign.company_name || auth.name;
      const userKey = `wipa_campaigns_${cName}`;
      const userList = JSON.parse(localStorage.getItem(userKey) || '[]');
      const idx = userList.findIndex(c => c.id === savedItem.id);
      if (idx >= 0) userList[idx] = Object.assign(userList[idx], savedItem);
      else userList.unshift(savedItem);
      localStorage.setItem(userKey, JSON.stringify(userList));
      return { success: true, data: savedItem };
    }
  } catch (e) {
    console.warn('API save failed, attempting direct Supabase write:', e);
  }

  // Direct Supabase fallback
  const sb = getSupabaseClient();
  if (sb && campaign.id) {
    try {
      const { data, error } = await sb
        .from('ad_campaigns')
        .update({
          headline: campaign.headline,
          description: campaign.description,
          target_url: campaign.target_url,
          cta_label: campaign.cta_label,
          banner_image_url: campaign.banner_image_url,
          is_active: campaign.is_active,
          updated_at: new Date().toISOString()
        })
        .eq('id', campaign.id)
        .select();

      if (!error && data && data[0]) {
        const cName = campaign.company_name || auth.name;
        const userKey = `wipa_campaigns_${cName}`;
        const userList = JSON.parse(localStorage.getItem(userKey) || '[]');
        const idx = userList.findIndex(c => c.id === data[0].id);
        if (idx >= 0) userList[idx] = Object.assign(userList[idx], data[0]);
        else userList.unshift(data[0]);
        localStorage.setItem(userKey, JSON.stringify(userList));
        return { success: true, data: data[0] };
      }
    } catch (err) {
      console.error('Direct DB error:', err);
    }
  }

  // Save to advertiser specific localStorage
  const cName = campaign.company_name || auth.name;
  const userKey = `wipa_campaigns_${cName}`;
  const userList = JSON.parse(localStorage.getItem(userKey) || '[]');
  const newId = campaign.id || ('camp_' + Date.now());
  campaign.id = newId;
  const idx = userList.findIndex(c => c.id === newId);
  if (idx >= 0) userList[idx] = Object.assign(userList[idx], campaign);
  else userList.unshift(campaign);
  localStorage.setItem(userKey, JSON.stringify(userList));

  return { success: true, localOnly: true, data: campaign };
}

// Setup real-time listener for live impressions & clicks
function subscribeToCampaignMetrics(campaignId, onUpdate) {
  let targetId = campaignId;
  if (targetId === 'camp1') targetId = WIPA_SUPABASE_CONFIG.demoCampaignId;
  if (targetId === 'camp2') targetId = WIPA_SUPABASE_CONFIG.demoSecondaryId;

  const sb = getSupabaseClient();
  if (sb) {
    try {
      const channel = sb
        .channel(`ad_metrics_${targetId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'ad_campaigns',
            filter: `id=eq.${targetId}`
          },
          (payload) => {
            if (payload && payload.new) {
              onUpdate(payload.new);
            }
          }
        )
        .subscribe();
    } catch (e) {
      console.warn('Realtime channel error:', e);
    }
  }

  // Also setup 8-second polling fallback so metrics refresh seamlessly
  const intervalId = setInterval(async () => {
    try {
      const fresh = await fetchCampaignById(targetId);
      if (fresh) onUpdate(fresh);
    } catch (e) {}
  }, 8000);

  return () => clearInterval(intervalId);
}
