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

    // Udvidet keyword-liste: både dansk og engelsk (bruger word-boundary check)
    const SKILL_KW = [
      // Frontend
      'react','vue','angular','svelte','typescript','javascript','html','css','scss','tailwind',
      'webpack','vite','next.js','redux','graphql',
      // Backend
      'python','node.js','java','golang','rust','php','django','fastapi','flask','spring',
      'microservices','rest api','express',
      // Data & AI
      'sql','postgresql','mysql','mongodb','redis','machine learning','nlp','tensorflow','pytorch',
      'data science','power bi','tableau','pandas','spark','dbt','airflow',
      // Cloud & DevOps
      'docker','kubernetes','aws','azure','gcp','linux','terraform','ci/cd','github actions',
      'devops','ansible','grafana','nginx',
      // Design
      'figma','sketch','ux','user research','prototyping','wireframing','adobe xd','illustrator',
      'design systems','accessibility',
      // Produkt & Agile
      'scrum','agile','kanban','jira','confluence','product management','product owner',
      'project management','okr','kpi','roadmap',
      // Marketing
      'seo','sem','google ads','hubspot','salesforce','google analytics','content marketing',
      'email marketing','crm','b2b','saas','growth hacking','copywriting',
      // Forretning & Bløde
      'excel','powerpoint','communication','leadership','management','stakeholder',
      'business development','strategy','budget','finance','accounting','recruitment',
      'kommunikation','ledelse','projektledelse','strategi',
    ];

    // Word-boundary check for kort keywords for at undgå falske match (sql ≠ nosql)
    const kwMatch = (txt, kw) => {
      if (kw.length <= 4) {
        const re = new RegExp(`(?<![a-z])${kw.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?![a-z])`, 'i');
        return re.test(txt);
      }
      return txt.includes(kw);
    };

    const INDUSTRY = [
      ['Frontend',      ['frontend developer','frontend engineer','react developer','vue developer','angular developer','ui developer','web developer']],
      ['Cloud & DevOps',['devops','platform engineer','site reliability','infrastructure','cloud engineer','cloud architect','sre ']],
      ['Data & AI',     ['data scientist','data analyst','machine learning','business intelligence','analytics','mlops','data engineer']],
      ['Mobile',        ['ios developer','android developer','mobile developer','react native','flutter']],
      ['Design',        ['ux designer','ui designer','product designer','graphic designer','visual designer','art director']],
      ['IT/Tech',       ['developer','software engineer','backend','programmer','tech lead','it consultant','solution architect']],
      ['Marketing',     ['marketing','seo','content','brand','growth','communications','social media']],
      ['Finans',        ['finance','financial','accounting','controller','økonomi','revisor','regnskab','bank']],
      ['Salg',          ['sales','account executive','account manager','sælger','business development','customer success']],
      ['HR',            ['recruiter','recruitment','talent','people partner','hr ','human resources','personale']],
      ['Produkt',       ['product manager','product owner','scrum master','projektleder','project manager']],
      ['Ledelse',       ['director','head of','cto','cfo','coo','chief','vp of','chef','leder']],
    ];

    const jobs = raw.map((j, i) => {
      const desc      = (j.job_description || '').slice(0, 1500);
      const posted    = j.job_posted_at_datetime_utc || '';
      const days      = posted ? Math.floor((Date.now() - new Date(posted)) / 86400000) : 99;
      const postedTxt = days === 0 ? 'I dag' : days === 1 ? 'I går' : days < 7 ? `${days} dage siden` : days < 14 ? '1 uge siden' : `${Math.floor(days/7)} uger siden`;
      const titleTxt  = (j.job_title || '').toLowerCase();
      const txt       = (titleTxt + ' ' + desc).toLowerCase();
      const kws       = SKILL_KW.filter(k => kwMatch(txt, k));
      // Industry: match on title first (more precise), then fall back to full text
      const industry  = (INDUSTRY.find(([, hints]) => hints.some(h => titleTxt.includes(h)))
                      || INDUSTRY.find(([, hints]) => hints.some(h => txt.includes(h)))
                      || ['Andet'])[0];
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
