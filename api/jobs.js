// Vercel serverless function – henter danske job via JSearch (RapidAPI)
// Aggregerer fra LinkedIn, Indeed, Glassdoor m.fl.

const RAPIDAPI_KEY  = process.env.RAPIDAPI_KEY  || '43d523fe1fmshcfe1ddf604a4cfcp10e31cjsn1b31eeb14b3c';
const RAPIDAPI_HOST = 'jsearch.p.rapidapi.com';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const page   = Math.floor((parseInt(req.query.offset) || 0) / 20) + 1;
  const search = req.query.q || '';
  const query  = search ? `${search} jobs i Danmark` : 'jobs i Danmark';

  try {
    const url = `https://jsearch.p.rapidapi.com/search?query=${encodeURIComponent(query)}&page=${page}&num_pages=1&country=dk&date_posted=all&language=da`;

    const r = await fetch(url, {
      headers: {
        'x-rapidapi-key':  RAPIDAPI_KEY,
        'x-rapidapi-host': RAPIDAPI_HOST,
        'Content-Type':    'application/json',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!r.ok) {
      const txt = await r.text();
      res.status(502).json({ error: `JSearch HTTP ${r.status}: ${txt.slice(0,200)}`, jobs: [], total: 0 });
      return;
    }

    const data = await r.json();
    const raw  = data.data || [];

    const jobs = raw.map((j, i) => {
      const desc     = (j.job_description || '').slice(0, 1500);
      const posted   = j.job_posted_at_datetime_utc || '';
      const days     = posted ? Math.floor((Date.now() - new Date(posted)) / 86400000) : 99;
      const postedTxt = days === 0 ? 'I dag' : days === 1 ? 'I går' : days < 7 ? `${days} dage siden` : days < 14 ? '1 uge siden' : `${Math.floor(days/7)} uger siden`;

      const SKILL_KW = ['python','javascript','typescript','react','sql','java','golang','docker','kubernetes','aws','azure','figma','ux','scrum','agile','excel','power bi','kommunikation','ledelse','projektledelse','seo','b2b','saas'];
      const txt2     = (j.job_title + ' ' + desc).toLowerCase();
      const kws      = SKILL_KW.filter(k => new RegExp(`(?<!\\w)${k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?!\\w)`, 'i').test(txt2));

      const INDUSTRY = [
        ['IT/Tech',   ['developer','software','engineer','frontend','backend','devops','it ']],
        ['Design',    ['designer','ux','ui','grafisk','kreativ']],
        ['Data & AI', ['data scientist','analytiker','machine learning','bi ','analyst']],
        ['Marketing', ['marketing','seo','content','brand','kommunikation']],
        ['Finans',    ['finans','økonomi','revisor','regnskab','controller']],
        ['Salg',      ['sælger','salg','account','sales','business development']],
        ['HR',        ['hr ','rekruttering','talent','people']],
        ['Produkt',   ['product manager','product owner','projektleder','scrum master']],
      ];
      const industry = (INDUSTRY.find(([, kws]) => kws.some(k => txt2.includes(k))) || ['Andet'])[0];

      const mode = j.job_is_remote ? 'Remote'
        : (desc.toLowerCase().includes('hybrid') ? 'Hybrid' : 'Kontor');

      return {
        id:          `js-${j.job_id || i}`,
        title:       j.job_title || 'Stilling',
        company:     j.employer_name || 'Ukendt',
        location:    [j.job_city, j.job_country].filter(Boolean).join(', ') || 'Danmark',
        type:        j.job_employment_type || 'Fuldtid',
        workMode:    mode,
        salary:      j.job_min_salary && j.job_max_salary
                       ? `${Math.round(j.job_min_salary).toLocaleString('da')}–${Math.round(j.job_max_salary).toLocaleString('da')} kr/md`
                       : '',
        description: desc,
        keywords:    kws,
        posted:      postedTxt,
        deadline:    '',
        url:         j.job_apply_link || j.job_google_link || '',
        source:      'jsearch',
        sourceLabel: 'JSearch',
        industry,
      };
    });

    res.status(200).json({ jobs, total: data.status === 'OK' ? jobs.length * 5 : jobs.length, offset: req.query.offset || 0 });

  } catch (e) {
    res.status(502).json({ error: e.message, jobs: [], total: 0 });
  }
}
