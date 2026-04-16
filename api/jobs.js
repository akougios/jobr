// Vercel serverless function – proxier Jobnet.dk søgning server-side
// Ingen CORS-problemer, og Vercel's IPs er ikke blacklistet af Jobnet

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const offset = parseInt(req.query.offset) || 0;
  const search = req.query.q || '';

  const jobnetUrl = `https://job.jobnet.dk/CV/FindWork/Search?Offset=${offset}&SortValue=NewestPosted&SearchString=${encodeURIComponent(search)}&widk=true`;

  try {
    // Første request: hent cookies fra Jobnet forsiden
    const homeResp = await fetch('https://job.jobnet.dk/CV/FindWork', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'da-DK,da;q=0.9',
      }
    });

    // Saml cookies
    const rawCookies = homeResp.headers.getSetCookie?.() || [];
    const cookieStr = rawCookies.map(c => c.split(';')[0]).join('; ');

    // Andet request: hent jobs med cookies
    const jobsResp = await fetch(jobnetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'da-DK,da;q=0.9',
        'Referer': 'https://job.jobnet.dk/CV/FindWork',
        'Origin': 'https://job.jobnet.dk',
        'X-Requested-With': 'XMLHttpRequest',
        ...(cookieStr ? { 'Cookie': cookieStr } : {}),
      }
    });

    if (!jobsResp.ok) {
      res.status(502).json({ error: `Jobnet HTTP ${jobsResp.status}`, jobs: [], total: 0 });
      return;
    }

    const text = await jobsResp.text();
    if (!text.trim().startsWith('{')) {
      res.status(502).json({ error: 'Jobnet returnerede ikke JSON', jobs: [], total: 0 });
      return;
    }

    const data = JSON.parse(text);
    res.status(200).json(data);

  } catch (e) {
    res.status(502).json({ error: e.message, jobs: [], total: 0 });
  }
}
