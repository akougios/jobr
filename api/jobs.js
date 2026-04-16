// Vercel serverless function – henter danske job via JSearch (RapidAPI)
// CommonJS format (ingen "type":"module" i package.json)

const RAPIDAPI_KEY  = process.env.RAPIDAPI_KEY  || '43d523fe1fmshcfe1ddf604a4cfcp10e31cjsn1b31eeb14b3c';
const RAPIDAPI_HOST = 'jsearch.p.rapidapi.com';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const page   = Math.floor((parseInt(req.query.offset) || 0) / 20) + 1;
  const search = req.query.q || '';
  const query  = search ? `${search} jobs i Danmark` : 'jobs i Danmark';

  try {
    const url = `https://jsearch.p.rapidapi.com/search?query=${encodeURIComponent(query)}&page=${page}&num_pages=1&country=dk&date_posted=all`;

    const r = await fetch(url, {
      headers: {
        'x-rapidapi-key':  RAPIDAPI_KEY,
        'x-rapidapi-host': RAPIDAPI_HOST,
        'Content-Type':    'application/json',
      },
    });

    if (!r.ok) {
      const txt = await r.text();
      return res.status(502).json({ error: `JSearch HTTP ${r.status}: ${txt.slice(0,200)}`, jobs: [], total: 0 });
    }

    const data = await r.json();
    const raw  = data.data || [];

    // Udvidet keyword-liste: både dansk og engelsk (JSearch returnerer mix)
    const SKILL_KW = [
      // Tech
      'python','javascript','typescript','react','vue','angular','node','sql','java','golang','rust','php',
      'docker','kubernetes','aws','azure','gcp','linux','git','ci/cd','devops','api','cloud',
      'machine learning','nlp','tensorflow','pytorch','data science','power bi','tableau','spark',
      // Design
      'figma','sketch','ux','ui','user research','prototyping','wireframing','adobe',
      // Business
      'excel','powerpoint','scrum','agile','kanban','jira','okr','kpi','project management',
      'kommunikation','ledelse','projektledelse','salg','marketing','seo','sem','b2b','saas','crm',
      'hubspot','salesforce','google analytics','content','stakeholder','strategy','budget',
      // English equivalents
      'leadership','management','communication','sales','finance','accounting','recruitment',
      'product management','product owner','business development','customer success',
    ];

    const INDUSTRY = [
      ['IT/Tech',   ['developer','software','engineer','frontend','backend','devops','programmer','tech lead']],
      ['Design',    ['designer','ux','ui','graphic','creative','visual','brand']],
      ['Data & AI', ['data scientist','data analyst','machine learning','business intelligence','analytics','mlops']],
      ['Marketing', ['marketing','seo','content','brand','growth','communications','pr ','social media']],
      ['Finans',    ['finance','financial','accounting','controller','økonomi','revisor','regnskab','bank']],
      ['Salg',      ['sales','account executive','account manager','sælger','business development','customer success']],
      ['HR',        ['recruiter','recruitment','talent','people','hr ','human resources','personale']],
      ['Produkt',   ['product manager','product owner','scrum master','projektleder','project manager']],
      ['Ledelse',   ['director','manager','head of','cto','cfo','coo','lead','chef','leder']],
    ];

    const jobs = raw.map((j, i) => {
      const desc      = (j.job_description || '').slice(0, 1500);
      const posted    = j.job_posted_at_datetime_utc || '';
      const days      = posted ? Math.floor((Date.now() - new Date(posted)) / 86400000) : 99;
      const postedTxt = days === 0 ? 'I dag' : days === 1 ? 'I går' : days < 7 ? `${days} dage siden` : days < 14 ? '1 uge siden' : `${Math.floor(days/7)} uger siden`;
      const txt       = (j.job_title + ' ' + desc).toLowerCase();
      const kws       = SKILL_KW.filter(k => txt.includes(k));
      const industry  = (INDUSTRY.find(([, kws]) => kws.some(k => txt.includes(k))) || ['Andet'])[0];
      const mode      = j.job_is_remote ? 'Remote' : txt.includes('hybrid') ? 'Hybrid' : 'Kontor';

      // Udled seniority fra titel og beskrivelse
      const seniorityHints = {
        'Junior':        ['junior','entry level','graduate','nyuddannet','studerende','trainee'],
        'Mid-level':     ['mid','medior','experienced','erfaren'],
        'Senior':        ['senior','specialist','expert','principal','lead developer'],
        'Lead / Manager':['manager','director','head of','chef','leder','lead','cto','cfo'],
      };
      const seniority = Object.entries(seniorityHints).find(([, hints]) => hints.some(h => txt.includes(h)))?.[0] || '';

      // Udled erfaringsår fra tekst
      const yrsMatch = txt.match(/(\d+)\+?\s*years?\s*(?:of\s*)?experience|(\d+)\+?\s*års?\s*erfaring/i);
      const reqYears = yrsMatch ? parseInt(yrsMatch[1] || yrsMatch[2]) : null;

      return {
        id:          `js-${j.job_id || i}`,
        title:       j.job_title || 'Stilling',
        company:     j.employer_name || 'Ukendt',
        location:    [j.job_city, j.job_country].filter(Boolean).join(', ') || 'Danmark',
        type:        j.job_employment_type || 'FULLTIME',
        workMode:    mode,
        salary:      j.job_min_salary ? `${Math.round(j.job_min_salary).toLocaleString()}–${Math.round(j.job_max_salary||j.job_min_salary*1.3).toLocaleString()} kr/md` : '',
        description: desc,
        keywords:    kws,
        posted:      postedTxt,
        deadline:    '',
        url:         j.job_apply_link || j.job_google_link || '',
        source:      'jsearch',
        sourceLabel: 'JSearch',
        industry,
        seniority,
        reqYears,
      };
    });

    return res.status(200).json({ jobs, total: jobs.length * 5, offset: req.query.offset || 0 });

  } catch (e) {
    return res.status(502).json({ error: e.message, jobs: [], total: 0 });
  }
};
