import React, { useState, useEffect, useRef, useMemo, useCallback, Component } from 'react'
import { createClient } from '@supabase/supabase-js'
import mammoth from 'mammoth'

const SUPABASE_URL      = 'https://dlqolbmbmebrysvmwfcz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRscW9sYm1ibWVicnlzdm13ZmN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNzA0ODIsImV4cCI6MjA5MTc0NjQ4Mn0.9ZlvibZ-Mte_LZsfFSC8GyB2CP37gEXWQta_EtEL4DA';
const RAILWAY_URL       = 'https://web-production-6d78c.up.railway.app';

// API_BASE: lokalt peger på localhost, på Vercel peger på Railway
const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? ''
  : RAILWAY_URL;

// Supabase klient — bruger sessionStorage som default (slettes når browser lukkes)
// "Forbliv logget ind" skifter til localStorage via storageKey-trick ved login
const _sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: window.sessionStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  }
});
// Hjælpefunktion: skift til localStorage-baseret persistence
function enablePersistentLogin() {
  // Kopiér session fra sessionStorage → localStorage så den overlever genstart
  const key = Object.keys(window.sessionStorage).find(k => k.startsWith('sb-'));
  if (key) {
    window.localStorage.setItem(key, window.sessionStorage.getItem(key));
  }
}
function disablePersistentLogin() {
  Object.keys(window.localStorage).filter(k => k.startsWith('sb-')).forEach(k => {
    window.localStorage.removeItem(k);
  });
}

/* ═══════════════════════ SKILL TAXONOMY ═══════════════════════════════════ */
const SKILL_GROUPS = {
  "Frontend":     ["react","vue","angular","svelte","next.js","nuxt","typescript","javascript","html","css","scss","tailwind","webpack","vite","storybook","redux","graphql","rest api"],
  "Backend":      ["node.js","python","java","c#","golang","rust","php","ruby","kotlin","spring","django","flask","fastapi","express","nest.js","microservices","api design"],
  "Mobile":       ["swift","kotlin","react native","flutter","ios","android","expo"],
  "Data & AI":    ["sql","postgresql","mysql","mongodb","redis","elasticsearch","pandas","numpy","scikit-learn","tensorflow","pytorch","nlp","machine learning","data science","power bi","tableau","looker","spark","kafka","airflow","dbt","llm"],
  "Cloud & DevOps":["aws","azure","gcp","docker","kubernetes","terraform","ansible","ci/cd","github actions","gitlab ci","linux","bash","nginx","datadog","grafana"],
  "Design":       ["figma","sketch","adobe xd","photoshop","illustrator","after effects","ux design","ui design","design systems","prototyping","user research","usability testing","accessibility","wireframing","a/b testing"],
  "Produkt & Agile":["product management","scrum","agile","kanban","safe","okr","kpi","jira","confluence","roadmap","product strategy","user stories","stakeholder management","product owner"],
  "Marketing":    ["seo","sem","google ads","facebook ads","content marketing","email marketing","hubspot","salesforce","crm","google analytics","growth hacking","b2b marketing","demand generation","copywriting"],
  "Forretning":   ["forretningsudvikling","projektledelse","budgettering","finansiel analyse","excel","powerpoint","sql","strategi","konsulentvirksomhed","change management","b2b","saas","vba","process optimization","digital transformation","governance","stakeholder management"],
  "Bløde":        ["kommunikation","ledelse","teamledelse","præsentation","forhandling","samarbejde","problemløsning","analytisk","selvstændig","kreativ","microsoft teams","ms teams"],
  "Øvrige IT":    ["vba","database architecture","database design","data modeling","microsoft 365","office 365","sharepoint","power automate","power apps","microsoft teams","visio","ms project","it-arkitektur","enterprise architecture"],
  // ── Udvidede danske fagkategorier ────────────────────────────────────────────
  "Handel & Service":  ["kundeservice","detailhandel","butiksbetjening","kassebetjening","salgsassistent","varemodtagelse","merchandising","lagerstyring","inventory","butiksdrift","kasseoptælling","salgsteknik"],
  "Produktion & Teknik":["vedligehold","montage","maskinbetjening","produktion","kvalitetskontrol","cnc","gaffeltruck","truck","lager","logistik","pakkemedarbejder","forsyningskæde","lean","5s","iso","el-installation","vvs","tømrer","maler","murer","mekaniker","reparation","teknisk service","eventopsætning","eventudstyr","stageopsætning","rigger"],
  "Administration":    ["office 365","word","outlook","teams","sap","navision","dynamics 365","bogføring","fakturering","sagsbehandling","administration","koordinering","planlægning","receptionist","sekretær","dokumenthåndtering","arkivering"],
  "Økonomi & Regnskab":["regnskab","bogføring","revision","controlling","budget","faktura","debitorer","kreditorer","ifrs","skat","moms","årsregnskab","likviditet","cash flow","balance","resultatopgørelse","regnskabsanalyse"],
  "HR & Rekruttering": ["rekruttering","onboarding","medarbejderudvikling","lønbehandling","arbejdsmiljø","personalehåndtering","hr administration","employer branding","talentudvikling","hr-system","kompetenceudvikling","trivselsmåling"],
  "Sundhed & Omsorg":  ["sygepleje","sosu","hjemmepleje","plejehjem","medicin","patient","omsorg","klinisk","praktiserende","socialrådgivning","psykologi","terapi","ergoterapi","fysioterapi","botilbud","handicapstøtte","pæd agogik","dagsinstitution"],
  "Undervisning":      ["undervisning","pædagogik","kursusledelse","e-learning","uddannelse","coaching","mentoring","vejledning","instruktør","formidling","klasseundervisning","curriculum","læringsdesign"],
  "Jura & Compliance": ["gdpr","compliance","kontraktret","arbejdsret","forsikring","due diligence","risikostyring","regulering","gdpr-rådgivning","persondatalovgivning","retsrådgivning"],
  "Kommunikation":     ["journalistik","redaktion","copywriting","pr","kommunikationsstrategi","sociale medier","fotografering","videoproduktion","podcast","nyhedsformidling","pressehåndtering","storytelling","indholdsstrategi"],
};

/* ── Semantiske synonymer: jobopslag bruger disse ord → matcher disse skills ── */
const SKILL_SYNONYMS = {
  // Engelske AI/Data-termer (hyppige i danske tech-jobopslag)
  'data science':         ['python','sql','machine learning','data modeling','analytisk','pandas'],
  'analytics':            ['sql','power bi','tableau','analytisk','data modeling'],
  'business intelligence':['power bi','tableau','sql','analytisk','data modeling'],
  'machine learning':     ['machine learning','python','scikit-learn','tensorflow'],
  'artificial intelligence':['machine learning','python','llm','tensorflow'],
  'ai solutions':         ['machine learning','python','llm'],
  'ai-løsninger':         ['machine learning','python','llm'],
  'rag':                  ['machine learning','llm','python'],
  'copilot':              ['llm','machine learning','python'],
  'dashboards':           ['power bi','tableau','looker','analytisk'],
  'insights':             ['analytisk','power bi','sql','data modeling'],
  'indsigter':            ['analytisk','power bi','sql'],
  'decision making':      ['analytisk','sql','power bi'],
  'beslutningstagere':    ['analytisk','stakeholder management','kommunikation'],
  'data-driven':          ['analytisk','sql','power bi','python'],
  'datadrevet':           ['analytisk','sql','power bi','python'],
  'reporting':            ['power bi','tableau','sql','excel','analytisk'],
  'rapportering':         ['power bi','sql','excel','analytisk'],
  'automation':           ['python','vba','power automate'],
  'automatisering':       ['python','vba','power automate'],
  'digital transformation':['projektledelse','change management','strategi','it-arkitektur'],
  'digitalisering':       ['projektledelse','change management','strategi'],
  'process optimization': ['projektledelse','analytisk','lean'],
  'procesoptimering':     ['projektledelse','analytisk','lean'],
  'it strategy':          ['it-arkitektur','strategi','projektledelse'],
  'it-strategi':          ['it-arkitektur','strategi','projektledelse'],
  'enterprise':           ['enterprise architecture','it-arkitektur','strategi'],
  'stakeholders':         ['stakeholder management','kommunikation','projektledelse'],
  'product teams':        ['scrum','agile','product management','samarbejde'],
  'cross-functional':     ['samarbejde','projektledelse','stakeholder management'],
  'governance':           ['governance','compliance','risikostyring'],
  'aml':                  ['compliance','governance','risikostyring'],
  'compliance':           ['compliance','governance','risikostyring'],
  'financial systems':    ['excel','sql','regnskab','analytisk'],
  'asset management':     ['excel','sql','analytisk','finansiel analyse'],
  // Tech → skills
  'programmering':        ['python','javascript','java','c#','golang'],
  'kodning':              ['python','javascript','java'],
  'softwareudvikling':    ['python','javascript','java','node.js','react'],
  'webudvikling':         ['javascript','react','html','css','next.js'],
  'databehandling':       ['sql','pandas','excel','python'],
  'dataanalyse':          ['sql','excel','power bi','tableau','analytisk','pandas'],
  'maskinlæring':         ['machine learning','scikit-learn','tensorflow','pytorch'],
  'kunstig intelligens':  ['machine learning','llm','nlp'],
  'databasestyring':      ['sql','postgresql','mysql','mongodb'],
  'cloud-løsninger':      ['aws','azure','gcp','docker','kubernetes'],
  'infrastruktur':        ['linux','docker','kubernetes','terraform','aws'],
  'it-support':           ['linux','windows','it'],
  'systemadministration': ['linux','windows','azure','aws'],
  // Design/UX
  'brugergrænseflader':   ['ux design','ui design','figma'],
  'brugervenlighed':      ['ux design','usability testing','user research'],
  'prototyper':           ['figma','prototyping','ux design'],
  // Forretning
  'projektstyring':       ['projektledelse','scrum','agile','jira'],
  'forretningsstrategi':  ['strategi','forretningsudvikling','konsulentvirksomhed'],
  'kundehåndtering':      ['crm','kundeservice','salesforce','hubspot'],
  'digitalisering':       ['projektledelse','change management','saas'],
  // Produktion/håndværk
  'vedligehold':          ['vedligehold','teknisk service','reparation'],
  'vedligeholdelse':      ['vedligehold','teknisk service','reparation'],
  'serviceopgaver':       ['teknisk service','kundeservice','vedligehold'],
  'eventopsætning':       ['eventopsætning','eventudstyr','montage'],
  'stageopsætning':       ['stageopsætning','rigger','eventopsætning'],
  'pakkemedarbejder':     ['pakkemedarbejder','lager','logistik'],
  'lagerhåndtering':      ['lager','logistik','lagerstyring'],
  'gaffeltruck':          ['gaffeltruck','truck','lager'],
  // Økonomi
  'regnskabsaflæggelse':  ['regnskab','bogføring','årsregnskab','ifrs'],
  'finansiel rapportering':['regnskab','controlling','ifrs','årsregnskab'],
  'budgetopfølgning':     ['budget','controlling','finansiel analyse','excel'],
  'kreditorstyring':      ['kreditorer','bogføring','regnskab'],
  // HR
  'personaleledelse':     ['ledelse','teamledelse','hr administration'],
  'medarbejdertrivsel':   ['trivselsmåling','hr administration','kommunikation'],
  // Kommunikation
  'indholdsproduktion':   ['copywriting','content marketing','indholdsstrategi'],
  'sociale medier':       ['sociale medier','content marketing','seo'],
  'brandingopgaver':      ['branding','kommunikation','marketing'],
  // Sundhed
  'pleje af borgere':     ['omsorg','sosu','hjemmepleje'],
  'medicingivning':       ['sygepleje','sosu','medicin'],

  // ── Udvidede danske job-posting vendinger ─────────────────────────────────
  // Strategi & ledelse
  'strategisk':           ['strategi','forretningsudvikling','analytisk'],
  'strategiske':          ['strategi','forretningsudvikling'],
  'strategisk tænkning':  ['strategi','analytisk','forretningsudvikling'],
  'forretningsforståelse':['forretningsudvikling','analytisk','strategi'],
  'forretningsmæssig':    ['forretningsudvikling','analytisk'],
  'ledererfaring':        ['ledelse','teamledelse'],
  'ledelseserfaring':     ['ledelse','teamledelse'],
  'personaleansvar':      ['ledelse','teamledelse'],
  'teamansvar':           ['teamledelse','ledelse'],
  'drive':                ['ledelse','selvstændig','projektledelse'],
  'initiativ':            ['selvstændig','kreativ'],
  'selvstændig':          ['selvstændig','projektledelse'],
  'proaktiv':             ['selvstændig','kreativ'],
  // Analyse & data
  'analytiske evner':     ['analytisk','dataanalyse'],
  'analytisk stærk':      ['analytisk','dataanalyse'],
  'stærke analytiske':    ['analytisk','dataanalyse','sql'],
  'dataorienteret':       ['analytisk','sql','dataanalyse'],
  'databaseret':          ['analytisk','sql','dataanalyse'],
  'kvantitativ':          ['analytisk','excel','sql'],
  'talstærk':             ['analytisk','excel','finansiel analyse'],
  'excel avanceret':      ['excel','analytisk'],
  'avanceret excel':      ['excel','analytisk'],
  'nøgletal':             ['kpi','analytisk','excel'],
  'kpi':                  ['kpi','analytisk','excel','rapportering'],
  'overblik':             ['analytisk','projektledelse','samarbejde'],
  // Kommunikation & præsentation
  'skriftlig formidling': ['kommunikation','copywriting'],
  'mundtlig formidling':  ['kommunikation','præsentation'],
  'formidlingsevner':     ['kommunikation','præsentation'],
  'formidlingsevne':      ['kommunikation','præsentation'],
  'præsentationsteknik':  ['præsentation','kommunikation'],
  'stærk kommunikator':   ['kommunikation','præsentation'],
  'kommunikere komplekst':['kommunikation','præsentation','analytisk'],
  'skabe relationer':     ['samarbejde','stakeholder management','kommunikation'],
  'relationsopbygning':   ['samarbejde','stakeholder management'],
  'netværk':              ['samarbejde','stakeholder management','forretningsudvikling'],
  // Projekt & forandring
  'projektstyring':       ['projektledelse','scrum','agile'],
  'forandringsledelse':   ['forandringsledelse','projektledelse','kommunikation'],
  'forandringsprocesser': ['forandringsledelse','projektledelse'],
  'implementering':       ['projektledelse','forandringsledelse','procesoptimering'],
  'implementere':         ['projektledelse','procesoptimering'],
  'koordinering':         ['projektledelse','samarbejde'],
  'koordinere':           ['projektledelse','samarbejde'],
  'planlægning':          ['projektledelse','analytisk'],
  'prioritering':         ['projektledelse','selvstændig','analytisk'],
  'eksekvering':          ['projektledelse','selvstændig'],
  'eksekvere':            ['projektledelse','selvstændig'],
  'leverancer':           ['projektledelse','samarbejde'],
  // Tværfagligt samarbejde
  'tværfagligt':          ['samarbejde','stakeholder management','kommunikation'],
  'tværorganisatorisk':   ['samarbejde','stakeholder management'],
  'på tværs af':          ['samarbejde','stakeholder management','projektledelse'],
  'interessenter':        ['stakeholder management','kommunikation'],
  'interne og eksterne':  ['stakeholder management','kommunikation','samarbejde'],
  'mange interessenter':  ['stakeholder management','kommunikation'],
  'ledelsen':             ['kommunikation','ledelse','præsentation'],
  'beslutningstag':       ['analytisk','stakeholder management','kommunikation'],
  // Forretningsudvikling
  'vækst':                ['forretningsudvikling','strategi','salg'],
  'nye forretningsmuligheder':['forretningsudvikling','salg','strategi'],
  'kommerciel':           ['forretningsudvikling','salg','strategi'],
  'salgserfaring':        ['salg','forhandling','kommunikation'],
  'kundekontakt':         ['kundeservice','kommunikation','samarbejde'],
  'kunderelationer':      ['kundeservice','crm','samarbejde'],
  // AI & teknologi
  'kunstig intelligens':  ['machine learning','llm','python'],
  'ai-løsninger':         ['machine learning','llm','python'],
  'ai-modeller':          ['machine learning','llm','python'],
  'ai-initiativer':       ['machine learning','strategi','projektledelse'],
  'generative ai':        ['llm','machine learning','python'],
  'llm':                  ['llm','machine learning','python'],
  'rag-systemer':         ['llm','machine learning','python'],
  'prompt engineering':   ['llm','machine learning'],
  'machine learning':     ['machine learning','python','scikit-learn'],
  'datamodeller':         ['data modeling','sql','analytisk'],
  'dataplatform':         ['sql','cloud & devops','data science'],
  'business intelligence':['power bi','tableau','sql','analytisk'],
  'indsigtsfuld':         ['analytisk','kommunikation'],
  // Risk & compliance
  'risici':               ['risikostyring','analytisk'],
  'risikovurdering':      ['risikostyring','analytisk'],
  'regulatorisk':         ['compliance','governance','risikostyring'],
  'lovgivning':           ['compliance','jura & compliance'],
  'persondatalovgivning': ['gdpr','compliance'],
  'databeskyttelse':      ['gdpr','compliance'],
  // Økonomi
  'budgetansvar':         ['budgettering','finansiel analyse','excel'],
  'økonomisk overblik':   ['finansiel analyse','analytisk','excel'],
  'regnskabsforståelse':  ['regnskab','finansiel analyse','excel'],
  'finansielle resultater':['finansiel analyse','regnskab','analytisk'],
  'p&l':                  ['finansiel analyse','budgettering','regnskab'],
};
// Flat list with category attached
const ALL_SKILLS = Object.entries(SKILL_GROUPS).flatMap(([cat,skills]) =>
  skills.map(s => ({ name:s, cat }))
);

/* ═══════════════════════ CV ANALYSIS ENGINE ════════════════════════════════ */
const norm = t => (t||"").toLowerCase().replace(/[^\w\sæøå]/g," ").replace(/\s+/g," ").trim();

/* ── Normalisér engelske skill-navne til danske standardnavne ─────────────── */
/* Bruges til at oversætte AI-returnerede engelske navne (fx "Strategy" → "strategi") */
const SKILL_NORMALIZE = {
  // Strategi & forretning
  'strategy':                'strategi',
  'strategic planning':      'strategi',
  'strategic management':    'strategi',
  'corporate strategy':      'strategi',
  'business strategy':       'strategi',
  'go-to-market':            'strategi',
  'go to market':            'strategi',
  'management':              'ledelse',
  'leadership':              'ledelse',
  'people leadership':       'ledelse',
  'team management':         'teamledelse',
  'team leadership':         'teamledelse',
  'people management':       'teamledelse',
  'line management':         'teamledelse',
  'project management':      'projektledelse',
  'programme management':    'projektledelse',
  'program management':      'projektledelse',
  'project coordination':    'projektledelse',
  'business development':    'forretningsudvikling',
  'commercial development':  'forretningsudvikling',
  'consulting':              'konsulentvirksomhed',
  'advisory':                'konsulentvirksomhed',
  'financial analysis':      'finansiel analyse',
  'financial modeling':      'finansiel analyse',
  'financial planning':      'finansiel analyse',
  'budgeting':               'budgettering',
  'budget management':       'budgettering',
  'digital transformation':  'digital transformation',
  'change management':       'forandringsledelse',
  'organizational change':   'forandringsledelse',
  'process optimization':    'procesoptimering',
  'process improvement':     'procesoptimering',
  'process efficiency':      'procesoptimering',
  'risk management':         'risikostyring',
  'risk mitigation':         'risikostyring',
  'risk assessment':         'risikostyring',
  'compliance':              'compliance',
  'regulatory compliance':   'compliance',
  'it architecture':         'it-arkitektur',
  'enterprise architecture': 'it-arkitektur',
  'solution architecture':   'it-arkitektur',
  'stakeholder management':  'stakeholder management',
  'stakeholder engagement':  'stakeholder management',
  'reporting':               'rapportering',
  'management reporting':    'rapportering',
  'governance':              'governance',
  // Bløde kompetencer
  'communication':           'kommunikation',
  'communications':          'kommunikation',
  'collaboration':           'samarbejde',
  'teamwork':                'samarbejde',
  'cross-functional collaboration': 'samarbejde',
  'analytical':              'analytisk',
  'analytical skills':       'analytisk',
  'analysis':                'analytisk',
  'data-driven':             'analytisk',
  'quantitative analysis':   'analytisk',
  'presentation':            'præsentation',
  'presenting':              'præsentation',
  'negotiation':             'forhandling',
  'contract negotiation':    'forhandling',
  'problem solving':         'problemløsning',
  'problem-solving':         'problemløsning',
  'creative':                'kreativ',
  'creativity':              'kreativ',
  'innovation':              'kreativ',
  'independent':             'selvstændig',
  'proactive':               'selvstændig',
  // Data
  'data analysis':           'dataanalyse',
  'data analytics':          'dataanalyse',
  'data science':            'data science',
  'machine learning':        'machine learning',
  'artificial intelligence': 'machine learning',
  'large language models':   'llm',
  'large language model':    'llm',
  'generative ai':           'llm',
  'natural language processing': 'nlp',
  // Økonomi
  'accounting':              'regnskab',
  'bookkeeping':             'regnskab',
  'financial accounting':    'regnskab',
  'controlling':             'controlling',
  // HR
  'recruitment':             'rekruttering',
  'recruiting':              'rekruttering',
  'talent acquisition':      'rekruttering',
  'employee development':    'medarbejderudvikling',
  'talent development':      'medarbejderudvikling',
  // Produkt
  'product management':      'product management',
  'product strategy':        'product strategy',
};

function normalizeSkillName(name) {
  const key = name.toLowerCase().trim();
  return SKILL_NORMALIZE[key] || name;
}

/* ── English → Danish skill aliases: CV text in English finds Danish skill names ── */
const ENGLISH_ALIASES = {
  // Forretning / strategi
  'strategi':               ['strategy','strategic','strategist','strategic planning','strategic direction','go-to-market','go to market'],
  'ledelse':                ['management','leadership','managing','managed','head of','director','vp of','vice president'],
  'teamledelse':            ['team management','team lead','team leader','team leadership','people management','people leader','line management'],
  'projektledelse':         ['project management','project manager','programme management','program management','project lead','project coordinator','pmo'],
  'forretningsudvikling':   ['business development','business growth','biz dev','commercial development','market expansion'],
  'konsulentvirksomhed':    ['consulting','consultant','advisory','adviser','advisor'],
  'finansiel analyse':      ['financial analysis','financial modeling','financial planning','financial reporting','financial modeling'],
  'budgettering':           ['budgeting','budget management','budget planning','budget responsibility','budget ownership'],
  'digital transformation': ['digital transformation','digitalization','digital strategy','digital initiatives'],
  'forandringsledelse':     ['change management','organizational change','transformation management','change leadership'],
  'procesoptimering':       ['process optimization','process improvement','process efficiency','business process','workflow optimization'],
  'risikostyring':          ['risk management','risk mitigation','risk assessment','risk analysis','risk framework'],
  'governance':             ['governance','corporate governance'],
  'compliance':             ['compliance','regulatory affairs','regulatory compliance','aml','kyc'],
  'it-arkitektur':          ['it architecture','enterprise architecture','solution architecture','systems architecture','technical architecture'],
  'stakeholder management': ['stakeholder management','stakeholder engagement','managing stakeholders','stakeholders'],
  'rapportering':           ['reporting','reports','management reporting','executive reporting'],

  // Bløde kompetencer
  'kommunikation':          ['communication','communications','communicating','present to','communicate with'],
  'samarbejde':             ['collaboration','teamwork','cooperat','cross-functional','cross functional','working closely','partnering','partnered with'],
  'analytisk':              ['analytical','analysis','analyze','analysing','analyzing','data-driven','evidence-based','evidence based','quantitative'],
  'præsentation':           ['presentation','presenting','presented to','pitching','pitch'],
  'forhandling':            ['negotiation','negotiating','negotiate','contract negotiation','deal'],
  'problemløsning':         ['problem solving','problem-solving','troubleshooting','issue resolution'],
  'selvstændig':            ['independent','self-driven','proactive','autonomous','self-managed','initiative'],
  'kreativ':                ['creative','creativity','innovative','innovation','ideation'],

  // Data / AI
  'dataanalyse':            ['data analysis','data analytics','analyzing data','data interpretation'],
  'data modeling':          ['data modeling','data modelling','data model'],
  'machine learning':       ['machine learning','ml model','ml pipeline'],
  'llm':                    ['large language model','llm','chatgpt','gpt','generative ai'],
  'nlp':                    ['natural language processing','nlp','text mining','text analytics'],

  // Økonomi
  'regnskab':               ['accounting','financial accounting','bookkeeping','accounts','p&l'],
  'controlling':            ['controlling','financial control','cost control','management accounting'],

  // HR
  'rekruttering':           ['recruitment','recruiting','talent acquisition','hiring','headhunting'],
  'onboarding':             ['onboarding','employee onboarding','induction'],
  'medarbejderudvikling':   ['employee development','people development','talent development','staff development'],

  // Marketing / kommunikation
  'seo':                    ['search engine optimization','seo strategy','organic search'],
  'content marketing':      ['content marketing','content strategy','editorial','content creation'],
  'indholdsstrategi':       ['content strategy','editorial strategy'],

  // IT
  'sharepoint':             ['sharepoint','share point'],
  'power bi':               ['power bi','powerbi'],
  'microsoft 365':          ['microsoft 365','office 365','m365','o365'],
  'power automate':         ['power automate','power platform','ms flow'],

  // Produkt
  'product management':     ['product management','product manager','product owner','product lead'],
  'agile':                  ['agile','agile methodology','agile working'],
  'scrum':                  ['scrum','scrum master','sprint'],
  'okr':                    ['okr','objectives and key results','okrs'],
  'kpi':                    ['kpi','key performance indicator','kpis','metrics','performance metrics'],
  'roadmap':                ['roadmap','product roadmap','strategic roadmap'],
};

function extractSkillsFromText(text) {
  const t = norm(text);
  const found = {};
  ALL_SKILLS.forEach(({name,cat}) => {
    // Built-in tech aliases
    const techAliases = name === "c#" ? ["c#","csharp","c sharp"] :
                        name === "node.js" ? ["node.js","nodejs","node js"] :
                        name === "next.js" ? ["next.js","nextjs","next js"] :
                        name === "nest.js" ? ["nest.js","nestjs"] :
                        name === "vue"     ? ["vue","vuejs","vue.js"] :
                        name === "react"   ? ["react","reactjs"] :
                        [name];
    // English aliases for Danish/mixed skill names
    const enAliases = ENGLISH_ALIASES[name] || [];
    const aliases = [...techAliases, ...enAliases];

    let hits = 0;
    aliases.forEach(a => {
      const escaped = a.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
      const re = new RegExp(`(?<![\\w])${escaped}(?![\\w])`, "gi");
      hits += (t.match(re)||[]).length;
    });
    if (hits > 0) {
      const existing = found[name];
      if (!existing || hits > existing.hits) found[name] = { name, cat, hits, confidence: Math.min(30 + hits * 20, 100), inferred: false };
    }
  });
  return Object.values(found).sort((a,b) => b.hits - a.hits);
}

/* ── Sentence-level inference: read context, infer implied competencies ─── */
const INFERENCE_PATTERNS = [
  // Leadership / people management
  { re: /(?:ledede?|ansvarlig\s+for|styrede?|managede?|coachede?|onboardede?|mentorerede?)\s+(?:\w+\s+){0,5}(?:team|medarbejdere?|udviklere?|designere?|ansatte?|kolleger)/gi,
    skills: ["ledelse","teamledelse"], cat:"Bløde", conf:80 },
  { re: /(?:rekrutterede?|ansatte?|opbyggede?\s+(?:et\s+)?team|ansatte?\s+\d+)/gi,
    skills: ["ledelse","rekruttering"], cat:"Bløde", conf:72 },
  { re: /team\s+(?:på|af)\s+\d+|ledte?\s+\d+\s+(?:medarbejdere?|udviklere?|designere?)/gi,
    skills: ["ledelse","teamledelse"], cat:"Bløde", conf:85 },

  // Communication / presentations
  { re: /(?:præsenterede?|holdt\s+oplæg|faciliterede?)\s+(?:for\s+)?(?:ledelsen|direktion|bestyrelse|c-suite|stakeholders?|kunder)/gi,
    skills: ["kommunikation","præsentation","stakeholder management"], cat:"Bløde", conf:82 },
  { re: /(?:stakeholder\s*management|på\s+tværs\s+af\s+(?:teams?|afdelinger?|organisationen)|tværfaglig\s+samarbejde)/gi,
    skills: ["stakeholder management","samarbejde"], cat:"Bløde", conf:75 },

  // Data-driven achievements
  { re: /(?:øgede?|forbedrede?|reducerede?|fordoble(?:de?)?|løftede?|voksede?)\s+(?:\w+\s*){0,4}med\s+\d+\s*%/gi,
    skills: ["analytisk","datadrevet"], cat:"Data & AI", conf:80 },
  { re: /(?:a\/b[\s-]?test(?:s|ede?)?|split[\s-]test|multivariate\s+test)/gi,
    skills: ["a/b testing","analytisk"], cat:"Data & AI", conf:82 },
  { re: /(?:konverteringsrate|konvertering|ctr|cpc|roas|roi)\s+(?:øgede?|forbedrede?|analyserede?)/gi,
    skills: ["analytisk","google analytics"], cat:"Data & AI", conf:75 },
  { re: /(?:bygge(?:de?)?|oprettede?|designede?)\s+(?:\w+\s+){0,3}(?:dashboard|rapporter|metrics|kpi)/gi,
    skills: ["analytisk","kpi"], cat:"Data & AI", conf:70 },

  // Product / UX research
  { re: /(?:brugerinterviews?|user\s*interview|usability[\s-]test|brugertests?|user\s*research|feltundersøgelse)/gi,
    skills: ["user research","ux design"], cat:"Design", conf:82 },
  { re: /(?:product\s*discovery|design\s*sprint|jobs?[\s-]to[\s-]be[\s-]done|jtbd|personas?|empathy\s*map|customer\s*journey)/gi,
    skills: ["user research","product management"], cat:"Produkt & Agile", conf:78 },

  // Agile / delivery
  { re: /(?:sprint[\s-]planning|daily\s*standup|stand[\s-]?up\s+møde|retrospektiv|retrospective|sprint[\s-]review)/gi,
    skills: ["scrum","agile"], cat:"Produkt & Agile", conf:72 },
  { re: /(?:backlog\s*(?:refinement|grooming)|user\s*stories?|epics?|definition\s+of\s+done|velocity)/gi,
    skills: ["scrum","product owner"], cat:"Produkt & Agile", conf:72 },

  // Architecture / system design
  { re: /(?:system[\s-]design|arkitekturerede?|skalerede?\s+(?:tjeneste|platform|system)|event[\s-]driven|domain[\s-]driven|DDD)/gi,
    skills: ["api design","microservices"], cat:"Backend", conf:78 },
  { re: /(?:refaktorerede?|refactor(?:erede?)?|teknisk\s+gæld|tech\s*debt)\s+(?:\w+\s+){0,5}(?:codebase|kode|system)/gi,
    skills: ["kodekvalitet","samarbejde"], cat:"Backend", conf:68 },

  // Full-stack breadth
  { re: /(?:fullstack|full[\s-]stack|frontend\s+(?:og|and)\s+backend|end[\s-]to[\s-]end\s+(?:løsning|feature|udvikling))/gi,
    skills: ["react","node.js","rest api"], cat:"Frontend", conf:68 },

  // ML / AI
  { re: /(?:trænede?\s+(?:en\s+)?(?:model|neural|netværk)|fine[\s-]?tun(?:ede?|ing)|NLP\s+pipeline|LLM|GPT|BERT|embedding|vector\s*store)/gi,
    skills: ["machine learning","nlp","llm"], cat:"Data & AI", conf:85 },
  { re: /(?:prediktiv\s+model|klassifikation|regression|clustering|recommender[\s-]system|anomali[\s-]detektion)/gi,
    skills: ["machine learning","scikit-learn"], cat:"Data & AI", conf:78 },

  // Cloud / infrastructure
  { re: /(?:deployede?\s+(?:på|til|i)\s+(?:aws|azure|gcp|cloud)|containeriserede?|serverless\s+arkitektur|lambda\s+funktion)/gi,
    skills: ["aws","docker","ci/cd"], cat:"Cloud & DevOps", conf:75 },
  { re: /(?:automatiserede?\s+(?:tests?|deployment|pipeline|build)|CI\/CD[\s-]pipeline|github\s+actions)/gi,
    skills: ["ci/cd","github actions"], cat:"Cloud & DevOps", conf:78 },

  // Growth / marketing
  { re: /(?:organisk\s+vækst|seo[\s-]strategi|content[\s-]strategi|lead[\s-]generation|demand[\s-]gen(?:eration)?)/gi,
    skills: ["seo","content marketing","growth hacking"], cat:"Marketing", conf:72 },
  { re: /(?:email[\s-]kampagne|nyhedsbrev|mailchimp|klaviyo|marketing[\s-]automation|drip[\s-]kampagne)/gi,
    skills: ["email marketing","hubspot"], cat:"Marketing", conf:72 },

  // Business development / consulting
  { re: /(?:forretningsudvikle(?:de?|lse)|strategiudvikling|vækststrategi|go[\s-]to[\s-]market|GTM|markedsindtrængen)/gi,
    skills: ["forretningsudvikling","strategi"], cat:"Forretning", conf:78 },
  { re: /(?:konsulentopgave|rådgivede?|adviserede?|business[\s-]case|due[\s-]diligence|feasibility)/gi,
    skills: ["konsulentvirksomhed","forretningsudvikling"], cat:"Forretning", conf:72 },

  // Project management
  { re: /(?:projektlede(?:de?|lse)|koordinerede?\s+(?:\w+\s+)?projekt|milestone|leverancer|risikostyring)/gi,
    skills: ["projektledelse"], cat:"Forretning", conf:72 },

  // Negotiation / sales signals
  { re: /(?:forhandlede?|indgik\s+aftaler?|lukkede?\s+(?:salg|deals?|kontrakter?)|revenue\s+(?:ansvarlig|mål|vækst))/gi,
    skills: ["forhandling","forretningsudvikling"], cat:"Bløde", conf:75 },

  // ── English CV patterns (CV'er skrevet på engelsk) ────────────────────────
  // Leadership / management (English)
  { re: /(?:managed?|led|leading|oversaw|oversee|directed|supervised?|responsible\s+for)\s+(?:a\s+)?(?:team|staff|employees?|engineers?|analysts?|developers?)/gi,
    skills: ["ledelse","teamledelse"], cat:"Bløde", conf:82 },
  { re: /(?:team\s+of\s+\d+|led\s+\d+|managed\s+\d+\s+(?:people|employees?|staff|analysts?))/gi,
    skills: ["ledelse","teamledelse"], cat:"Bløde", conf:85 },
  { re: /(?:head\s+of|director\s+of|vp\s+of|vice\s+president|c-suite|chief\s+(?:analytics|data|digital|strategy))/gi,
    skills: ["ledelse","strategi"], cat:"Bløde", conf:80 },

  // Strategy (English)
  { re: /(?:developed?\s+(?:strategy|strategic\s+plan|roadmap)|defined?\s+(?:strategy|vision|direction)|strategic\s+(?:planning|direction|initiatives?|goals?))/gi,
    skills: ["strategi","forretningsudvikling"], cat:"Forretning", conf:82 },
  { re: /(?:go[\s-]to[\s-]market|business\s+strategy|corporate\s+strategy|growth\s+strategy|market\s+strategy)/gi,
    skills: ["strategi","forretningsudvikling"], cat:"Forretning", conf:78 },

  // Stakeholder / communication (English)
  { re: /(?:presented?\s+to|reported\s+to|communicated?\s+with|collaborated?\s+with|partnered?\s+with)\s+(?:senior\s+)?(?:leadership|management|executives?|stakeholders?|c-level|board)/gi,
    skills: ["stakeholder management","kommunikation","præsentation"], cat:"Bløde", conf:82 },
  { re: /(?:stakeholder\s+(?:management|engagement|alignment|communication)|cross[\s-]functional\s+(?:teams?|collaboration|alignment))/gi,
    skills: ["stakeholder management","samarbejde"], cat:"Bløde", conf:78 },

  // Project management (English)
  { re: /(?:managed?\s+(?:multiple\s+)?projects?|project\s+(?:manager|management|lead|coordinator|delivery)|delivered?\s+projects?|programme\s+management)/gi,
    skills: ["projektledelse","samarbejde"], cat:"Forretning", conf:78 },
  { re: /(?:on\s+time\s+and\s+on\s+budget|milestones?|deliverables?|project\s+plan|project\s+scope|project\s+governance)/gi,
    skills: ["projektledelse"], cat:"Forretning", conf:72 },

  // Analytical / data-driven (English)
  { re: /(?:data[\s-]driven|analytically\s+strong|analytical\s+(?:skills?|mindset|approach)|evidence[\s-]based|quantitative\s+(?:analysis|skills?))/gi,
    skills: ["analytisk","dataanalyse"], cat:"Data & AI", conf:80 },
  { re: /(?:built|designed|developed|created)\s+(?:\w+\s+){0,3}(?:dashboard|dashboards|reports?|insights|metrics|kpis)/gi,
    skills: ["analytisk","kpi","rapportering"], cat:"Data & AI", conf:75 },
  { re: /(?:improved?\s+(?:by\s+)?\d+\s*%|reduced?\s+(?:by\s+)?\d+\s*%|increased?\s+(?:by\s+)?\d+\s*%|grew\s+(?:by\s+)?\d+\s*%)/gi,
    skills: ["analytisk"], cat:"Data & AI", conf:72 },

  // Change management / transformation (English)
  { re: /(?:change\s+management|organizational\s+change|business\s+transformation|digital\s+transformation|transformation\s+(?:program|project|initiative))/gi,
    skills: ["forandringsledelse","strategi","projektledelse"], cat:"Forretning", conf:80 },

  // Process improvement (English)
  { re: /(?:process\s+(?:improvement|optimization|redesign|re-engineering|efficiency)|streamlined?|optimized?|automated?\s+processes?|lean\s+processes?)/gi,
    skills: ["procesoptimering","analytisk"], cat:"Forretning", conf:75 },

  // Business development (English)
  { re: /(?:business\s+development|new\s+business|revenue\s+growth|market\s+expansion|new\s+markets?|business\s+growth|commercial\s+strategy)/gi,
    skills: ["forretningsudvikling","strategi"], cat:"Forretning", conf:78 },
  { re: /(?:consulting|consultant|advisory|advisors?|advising\s+(?:clients?|companies|organisations?))/gi,
    skills: ["konsulentvirksomhed","forretningsudvikling"], cat:"Forretning", conf:72 },

  // Negotiation (English)
  { re: /(?:negotiated?|closed?\s+(?:deals?|contracts?|agreements?)|contract\s+negotiation|vendor\s+(?:management|negotiation)|procurement)/gi,
    skills: ["forhandling","forretningsudvikling"], cat:"Bløde", conf:75 },

  // Risk / compliance (English)
  { re: /(?:risk\s+(?:management|assessment|mitigation|framework|governance)|compliance\s+(?:framework|management|monitoring)|regulatory\s+(?:compliance|requirements?|affairs))/gi,
    skills: ["risikostyring","compliance","governance"], cat:"Jura & Compliance", conf:78 },

  // AI / ML / Data science (English)
  { re: /(?:built|developed?|designed|deployed|implemented)\s+(?:\w+\s+){0,3}(?:ai|ml|llm|machine\s+learning|data\s+science|rag|copilot|genai|generative\s+ai)/gi,
    skills: ["machine learning","llm","data science"], cat:"Data & AI", conf:85 },
  { re: /(?:ai\s+(?:strategy|roadmap|solutions?|initiatives?|products?|adoption)|generative\s+ai|agentic\s+ai|ai[\s-]powered)/gi,
    skills: ["machine learning","llm","strategi"], cat:"Data & AI", conf:80 },

  // Collaboration / teamwork (English)
  { re: /(?:collaborated?\s+(?:closely\s+)?with|worked?\s+closely\s+with|partnered?\s+with|cross[\s-]functional|across\s+teams?|across\s+departments?)/gi,
    skills: ["samarbejde","stakeholder management"], cat:"Bløde", conf:72 },

  // Financial analysis (English)
  { re: /(?:financial\s+(?:analysis|modeling|planning|forecasting|reporting)|p&l\s+(?:responsibility|management)|budget\s+(?:management|responsibility|ownership))/gi,
    skills: ["finansiel analyse","budgettering","analytisk"], cat:"Forretning", conf:78 },
];

// Domain context patterns → infer industry expertise
const DOMAIN_PATTERNS = [
  { re: /(?:fintech|finanssektor|bank(?:ens|virksomhed)?|forsikring|pension|investeringer?|kapitalforvaltning|wealth\s*management|handelsbank|nordea|jyske\s*bank)/gi,
    domain:"Finance/Fintech", skills:["finansiel analyse","excel"], cat:"Forretning", conf:70 },
  { re: /(?:sundhedssektoren|pharma|medtech|medicinsk\s+(?:udstyr|teknologi)|hospital|klinik|healthcare|biotech|life\s*sciences?)/gi,
    domain:"Healthcare/Pharma", skills:["analytisk"], cat:"Forretning", conf:68 },
  { re: /(?:e-?commerce|webshop|online\s*handel|retail|dtc|d2c|marketplace)/gi,
    domain:"E-commerce", skills:["google analytics","seo"], cat:"Marketing", conf:68 },
  { re: /(?:startup|scale-?up|early[\s-]stage|serie\s*[ABC]|venture\s*backed|bootstrapped)/gi,
    domain:"Startup-erfaring", skills:["selvstændig","kreativ","forretningsudvikling"], cat:"Bløde", conf:72 },
  { re: /(?:kreativt\s+bureau|reklamebur|kommunikationsbur|pr[\s-]bureau|full[\s-]service\s+bureau)/gi,
    domain:"Bureauerfaring", skills:["kommunikation","kreativ","copywriting"], cat:"Bløde", conf:72 },
  { re: /(?:offentlig\s+sektor|kommune|region|ministerium|styrelse|statslig\s+institution)/gi,
    domain:"Offentlig sektor", skills:["projektledelse","samarbejde"], cat:"Forretning", conf:68 },
  { re: /(?:SaaS|B2B\s+software|enterprise\s+software|platform\s+(?:økonomi|virksomhed|business))/gi,
    domain:"SaaS/B2B", skills:["saas","b2b marketing","produktledelse"], cat:"Marketing", conf:70 },
  { re: /(?:NGO|non[\s-]profit|velgørenhed|hjælpeorganisation|nødhjælp)/gi,
    domain:"NGO/Non-profit", skills:["kommunikation","samarbejde"], cat:"Bløde", conf:65 },
];

function inferSkillsFromContext(text) {
  const inferred = {};
  const addSkill = (skillName, cat, conf) => {
    const key = norm(skillName);
    if (!inferred[key]) {
      inferred[key] = { name: skillName, cat, hits: 1, confidence: conf, inferred: true };
    } else {
      inferred[key].confidence = Math.min(inferred[key].confidence + 10, 95);
      inferred[key].hits++;
    }
  };
  // Run all sentence-level patterns
  INFERENCE_PATTERNS.forEach(({re, skills, cat, conf}) => {
    re.lastIndex = 0;
    const matches = text.match(re);
    if (matches && matches.length > 0) {
      skills.forEach(s => addSkill(s, cat, conf + Math.min((matches.length - 1) * 5, 10)));
    }
  });
  // Run domain patterns
  DOMAIN_PATTERNS.forEach(({re, domain, skills, cat, conf}) => {
    re.lastIndex = 0;
    const matches = text.match(re);
    if (matches && matches.length > 0) {
      // Add domain as a "skill" label
      addSkill(domain, cat, conf);
      skills.forEach(s => addSkill(s, cat, conf - 5));
    }
  });
  return Object.values(inferred);
}

function mergeSkills(explicit, inferred) {
  const merged = {};
  explicit.forEach(s => { merged[norm(s.name)] = { ...s, inferred: false }; });
  inferred.forEach(s => {
    const key = norm(s.name);
    if (!merged[key]) {
      // Only add inferred skill if it passes minimum confidence bar
      if (s.confidence >= 65) merged[key] = s;
    } else {
      // Explicit match already exists — boost confidence slightly
      merged[key].confidence = Math.min(merged[key].confidence + 8, 100);
    }
  });
  return Object.values(merged).sort((a,b) => {
    // Explicit skills first, then by confidence
    if (!a.inferred && b.inferred) return -1;
    if (a.inferred && !b.inferred) return 1;
    return b.confidence - a.confidence;
  });
}

function detectSeniority(text, years) {
  const t = norm(text);
  const seniorKw  = ["senior","lead","principal","staff","head of","director","architect","vp ","chief"];
  const midKw     = ["mid","medior","erfaren"];
  const juniorKw  = ["junior","trainee","praktikant","nyuddannet","entry level","graduate"];
  const leadKw    = ["manager","chef","director","head of","lead","vp ","cto","cpo","coo"];
  if (leadKw.some(k=>t.includes(k))) return "Lead / Manager";
  if (seniorKw.some(k=>t.includes(k)) || (years != null && years >= 7)) return "Senior";
  if (midKw.some(k=>t.includes(k)) || (years != null && years >= 3)) return "Mid-level";
  if (juniorKw.some(k=>t.includes(k)) || (years != null && years < 2)) return "Junior";
  if (years != null && years >= 5) return "Senior";
  return "Mid-level";
}

function extractYearsExp(text) {
  const t = text;
  // Strategy 1: explicit "X years experience"
  const explicit = [...t.matchAll(/(\d+)\+?\s*(?:år|years?)\s*(?:erfaring|experience|arbejdserfaring)/gi)];
  if (explicit.length) return Math.max(...explicit.map(m => parseInt(m[1])));
  // Strategy 2: date ranges (2018 – nu = 8 years)
  const ranges = [...t.matchAll(/(?:jan|feb|mar|apr|maj|jun|jul|aug|sep|okt|nov|dec|january|february|march|april|may|june|july|august|september|october|november|december)[\s.]*(\d{4})\s*[–\-–—]\s*(nu|now|present|i dag|dags dato|\d{4})/gi)];
  if (ranges.length) {
    const cur = new Date().getFullYear();
    let total = 0;
    ranges.forEach(m => {
      const start = parseInt(m[1]);
      const end = m[2].match(/\d{4}/) ? parseInt(m[2]) : cur;
      if (start > 1970 && start < cur+1) total += Math.max(0, end - start);
    });
    if (total > 0) return Math.min(total, 40);
  }
  // Strategy 3: year spans like "2015 – 2020"
  const yearSpans = [...t.matchAll(/\b(\d{4})\s*[–\-–—]\s*(\d{4})\b/g)];
  if (yearSpans.length) {
    let total = 0;
    yearSpans.forEach(m => {
      const a=parseInt(m[1]),b=parseInt(m[2]);
      if (a>1990&&b>1990&&b>a&&b-a<20) total+=b-a;
    });
    if (total>0) return Math.min(total,40);
  }
  return null;
}

function extractExperienceLines(text) {
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  const roles = [];
  const titleKws = ["developer","udvikler","designer","manager","analytiker","analyst","engineer","ingeniør","consultant","konsulent","lead","head","director","chef","koordinator","specialist","architect","arkitekt","officer","partner"];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.length < 4 || l.length > 90) continue;
    if (titleKws.some(k => norm(l).includes(k))) {
      const ctx = lines.slice(Math.max(0,i-1), i+3).join(" ");
      const yearMatch = ctx.match(/\b(19|20)\d{2}\b/g);
      roles.push({
        title: l.replace(/[•\-–*·]/g,"").trim(),
        years: yearMatch ? [...new Set(yearMatch)].join("–") : "",
      });
    }
  }
  return roles.slice(0,6);
}

function extractEducation(text) {
  const t = norm(text);
  const edKws = [
    { match:["phd","ph.d","doktor"], label:"PhD" },
    { match:["kandidat","cand.","master","msc","ma ","m.sc"], label:"Kandidat" },
    { match:["bachelor","bsc","b.sc","professionsbachelor"], label:"Bachelor" },
    { match:["erhvervsuddannelse","eux","htx","hhx","stx","gymnasie"], label:"Gymnasial/EUD" },
    { match:["bootcamp","selvlært","self-taught","autodidakt"], label:"Bootcamp/Selvlært" },
  ];
  for (const {match,label} of edKws) {
    if (match.some(m => t.includes(m))) return label;
  }
  return null;
}

function detectLanguages(text) {
  const t = norm(text);
  const langs = [
    {name:"Dansk", kws:["dansk","danish"]},
    {name:"Engelsk", kws:["engelsk","english"]},
    {name:"Tysk", kws:["tysk","german","deutsch"]},
    {name:"Fransk", kws:["fransk","french","français"]},
    {name:"Spansk", kws:["spansk","spanish","español"]},
    {name:"Svensk", kws:["svensk","swedish"]},
    {name:"Norsk", kws:["norsk","norwegian"]},
  ];
  return langs.filter(l => l.kws.some(k => t.includes(k))).map(l => l.name);
}

function detectRoleFamily(skills, title="") {
  const t = norm(title);
  const topCats = {};
  skills.slice(0,12).forEach(s => { topCats[s.cat] = (topCats[s.cat]||0) + s.hits; });
  const dominant = Object.entries(topCats).sort((a,b)=>b[1]-a[1])[0]?.[0];
  const titleMap = {
    "Frontend":["frontend","react","vue","angular","ui developer","web developer"],
    "Backend":["backend","server","api developer","java","python","golang","php developer"],
    "Data & AI":["data scientist","data engineer","machine learning","ml engineer","analytiker","bi ","data analyst"],
    "Design":["ux","ui designer","product designer","grafisk","visual designer"],
    "Produkt & Agile":["product manager","product owner","po ","projektleder","scrum master","agile coach"],
    "Marketing":["marketing","seo","sem","content","growth","brand","kommunikationsmedarbeider"],
    "Cloud & DevOps":["devops","platform engineer","sre","infrastructure","cloud"],
    "Forretning":["forretning","strategi","business","konsulent","manager"],
  };
  for (const [fam,kws] of Object.entries(titleMap)) {
    if (kws.some(k => t.includes(k))) return fam;
  }
  return dominant || "IT/Tech";
}

function buildStrengths(skills, seniority, education) {
  const strengths = [];
  const cats = [...new Set(skills.slice(0,15).map(s=>s.cat))];
  if (cats.length >= 3) strengths.push(`Bred teknisk profil på tværs af ${cats.slice(0,3).join(", ")}`);
  const topSkills = skills.slice(0,3).map(s=>s.name);
  if (topSkills.length) strengths.push(`Stærk erfaring med ${topSkills.join(", ")}`);
  if (seniority.includes("Senior")||seniority.includes("Lead")) strengths.push("Senior-niveau med dokumenteret erfaring");
  if (education?.includes("Kandidat")||education?.includes("PhD")) strengths.push(`${education}-uddannet`);
  if (skills.filter(s=>s.cat==="Bløde").length >= 2) strengths.push("Stærke kommunikations- og samarbejdsevner");
  return strengths.slice(0,4);
}

/* ─── AI-backed analyzeCV: kalder /api/analyze-cv, fallback til regelbaseret ── */
async function analyzeCV(rawText, fileName, onProgress) {
  onProgress?.("Forsøger AI-analyse...");

  // Prøv AI-endpoint
  let aiResult = null;
  const aiUrl = `${API_BASE}/api/analyze-cv`;
  console.log(`[AI] Kalder ${aiUrl} (${rawText.length} tegn)…`);
  try {
    const resp = await fetch(aiUrl, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({text: rawText}),
      signal: AbortSignal.timeout(35000),
    });
    console.log(`[AI] HTTP ${resp.status} ${resp.statusText}`);
    if (resp.ok) {
      const data = await resp.json();
      console.log("[AI] Svar:", JSON.stringify(data).slice(0, 300));
      if (!data.fallback && Array.isArray(data.skills) && data.skills.length > 0) {
        aiResult = data;
        console.log(`[AI] ✅ ${data.skills.length} skills via ${data.model}`);
      } else {
        console.warn("[AI] Fallback fra server:", data.error || "(ukendt fejl)", data);
      }
    } else {
      const txt = await resp.text().catch(() => '');
      console.error(`[AI] Fejl HTTP ${resp.status}:`, txt.slice(0, 300));
    }
  } catch (e) {
    console.error("[AI] Fetch fejl:", e.name, e.message);
  }

  // Regelbaseret analyse (bruges altid til roller og ekstra data)
  onProgress?.("Udtrækker kompetencer...");
  const explicitSkills = extractSkillsFromText(rawText);
  const inferredSkills = inferSkillsFromContext(rawText);
  const ruleSkills     = mergeSkills(explicitSkills, inferredSkills);
  const years     = extractYearsExp(rawText);
  const seniority = detectSeniority(rawText, years);
  const education = extractEducation(rawText);
  const languages = detectLanguages(rawText);
  const roles     = extractExperienceLines(rawText);

  let skills, roleFamily, strengths, aiAnalyzed = false;

  if (aiResult) {
    onProgress?.("Anvender AI-resultater...");
    aiAnalyzed = true;

    // Normalisér AI-kompetencer (sikr at alle felter er der + oversæt engelske navne)
    const aiSkills = (aiResult.skills || []).map(s => ({
      name:       normalizeSkillName(s.name || ""),
      cat:        s.cat  || "Forretning",
      confidence: s.confidence ?? 70,
      inferred:   s.inferred ?? false,
      hits:       s.hits ?? 1,
    })).filter(s => s.name.length > 1);

    // Merge: AI-skills + regelbaserede (regelbaserede tilføjer hvad AI evt. gik glip af)
    const merged = {};
    aiSkills.forEach(s => { merged[s.name.toLowerCase()] = s; });
    ruleSkills.forEach(s => {
      const sk = { ...s, name: normalizeSkillName(s.name) };
      const k = sk.name.toLowerCase();
      if (!merged[k]) merged[k] = sk;
    });
    skills = Object.values(merged).sort((a,b) => {
      if (!a.inferred && b.inferred) return -1;
      if (a.inferred && !b.inferred) return 1;
      return b.confidence - a.confidence;
    });

    roleFamily = aiResult.roleFamily || detectRoleFamily(skills, roles[0]?.title || "");
    strengths  = aiResult.strengths?.length ? aiResult.strengths
               : buildStrengths(skills, seniority, education);

    // Brug AI's seniority/years/education/languages/location hvis bedre
    const finalYears     = aiResult.years     ?? years;
    const finalSeniority = aiResult.seniority ?? seniority;
    const finalEducation = aiResult.education ?? education;
    const finalLanguages = aiResult.languages?.length ? aiResult.languages : languages;
    const finalLocation  = aiResult.location  || null;

    const skillsByCategory = {};
    skills.forEach(s => {
      if (!skillsByCategory[s.cat]) skillsByCategory[s.cat] = [];
      skillsByCategory[s.cat].push(s);
    });
    const inferredCount = skills.filter(s => s.inferred).length;
    const explicitCount = skills.filter(s => !s.inferred).length;

    return {
      rawText, fileName,
      skills, skillsByCategory,
      keywords: skills.slice(0,25).map(s=>s.name),
      years: finalYears, seniority: finalSeniority,
      education: finalEducation, languages: finalLanguages,
      roles, roleFamily, strengths,
      domains: aiResult.domains || [],
      adjacent_roles: aiResult.adjacent_roles || [],
      summary: aiResult.summary || '',
      context_keywords: aiResult.context_keywords || [],
      wildcard_roles: aiResult.wildcard_roles || [],
      working_style: aiResult.working_style || '',
      discovery_reasoning: aiResult.discovery_reasoning || '',
      location: finalLocation,
      totalSkills: skills.length, explicitCount, inferredCount,
      aiAnalyzed, aiModel: aiResult.model,
    };
  }

  // Ren regelbaseret fallback
  onProgress?.("Bygger profil...");
  skills     = ruleSkills.map(s => ({ ...s, name: normalizeSkillName(s.name) }));
  roleFamily = detectRoleFamily(skills, roles[0]?.title || "");
  strengths  = buildStrengths(skills, seniority, education);

  const skillsByCategory = {};
  skills.forEach(s => {
    if (!skillsByCategory[s.cat]) skillsByCategory[s.cat] = [];
    skillsByCategory[s.cat].push(s);
  });
  const inferredCount = skills.filter(s => s.inferred).length;
  const explicitCount = skills.filter(s => !s.inferred).length;

  return {
    rawText, fileName,
    skills, skillsByCategory,
    keywords: skills.slice(0,25).map(s=>s.name),
    years, seniority, education, languages,
    roles, roleFamily, strengths,
    totalSkills: skills.length, explicitCount, inferredCount,
    aiAnalyzed: false,
  };
}

/* ═══════════════════════ MATCHING ENGINE ═══════════════════════════════════ */

// Transferable skills map: hvis profil har domain X, giver det bonus ved jobs i Y
const DOMAIN_TRANSFER_MAP = {
  // Design & kreative fag
  'tekstildesign':      ['produktdesign','modedesign','industrielt design','ux','branding','kreativ'],
  'modedesign':         ['tekstildesign','produktdesign','branding','retail','e-commerce','kreativ'],
  'grafisk design':     ['ux','ui','branding','marketing','kommunikation','kreativ','medier'],
  'industrielt design': ['produktdesign','ingeniør','innovation','cad','produktion'],
  'ux design':          ['produktdesign','frontend','digital','app','brugeroplevelse'],
  'arkitektur':         ['projektledelse','byggeri','cad','ejendom','facility'],
  // Tech
  'backend':            ['api','cloud','devops','data','fullstack'],
  'frontend':           ['ux','ui','app','e-commerce','digital'],
  'data science':       ['ai','machine learning','analyse','business intelligence','statistik'],
  'devops':             ['cloud','infrastruktur','backend','sikkerhed'],
  // Forretning
  'salg':               ['account management','business development','crm','kundeservice','marketing'],
  'marketing':          ['content','social media','branding','kommunikation','pr','salg'],
  'økonomi':            ['regnskab','controlling','finans','analyse','revision'],
  'hr':                 ['rekruttering','organisationsudvikling','ledelse','kommunikation'],
  'projektledelse':     ['produktstyring','agile','scrum','ledelse','koordinering'],
  // Sundhed & videnskab
  'sygepleje':          ['sundhed','omsorg','klinik','patient','medicin'],
  'biologi':            ['laboratorie','forskning','miljø','pharma','kvalitet'],
  'kemi':               ['laboratorie','produktion','pharma','materialer','kvalitet'],
  // Kommunikation
  'journalistik':       ['content marketing','kommunikation','pr','social media','redaktion'],
  'kommunikation':      ['pr','marketing','content','branding','journalistik'],
  'pædagogik':          ['hr','undervisning','ledelse','kommunikation','coaching'],
};

/* ═══════════════════════ MATCHING ENGINE v2 ════════════════════════════════ */

/* ── NLP: Udtrækker udtrykkeligt nævnte krav fra jobteksten ─────────────────── *
 * Finder fraser som "erfaring med X", "kendskab til X", "du har X" osv.
 * + bullet-point extraction fra krav-sektioner                                 */
function extractJobRequirements(text) {
  const t = text.toLowerCase();
  const found = new Set();
  const terminator = /[,;•\n\r*\(\)]|(?:\s{2,})|$/;
  const cap = `([\\wæøå\\s\\-\\.\\/'&+#]{2,50}?)`;
  const end = `(?=[,;•\\n\\r*]|\\s{2,}|$)`;

  const patterns = [
    // Dansk — direkte krav
    new RegExp(`erfaring\\s+med\\s+${cap}${end}`, 'gi'),
    new RegExp(`erfaring\\s+inden\\s+for\\s+${cap}${end}`, 'gi'),
    new RegExp(`erfaring\\s+fra\\s+${cap}${end}`, 'gi'),
    new RegExp(`kendskab\\s+til\\s+${cap}${end}`, 'gi'),
    new RegExp(`godt\\s+kendskab\\s+til\\s+${cap}${end}`, 'gi'),
    new RegExp(`indgående\\s+kendskab\\s+til\\s+${cap}${end}`, 'gi'),
    new RegExp(`viden\\s+om\\s+${cap}${end}`, 'gi'),
    new RegExp(`viden\\s+inden\\s+for\\s+${cap}${end}`, 'gi'),
    new RegExp(`du\\s+har\\s+erfaring\\s+med\\s+${cap}${end}`, 'gi'),
    new RegExp(`du\\s+har\\s+(?:stærke\\s+)?kompetencer\\s+(?:inden\\s+for|i)\\s+${cap}${end}`, 'gi'),
    new RegExp(`du\\s+behersker\\s+${cap}${end}`, 'gi'),
    new RegExp(`du\\s+mestrer\\s+${cap}${end}`, 'gi'),
    new RegExp(`du\\s+er\\s+stærk\\s+i\\s+${cap}${end}`, 'gi'),
    new RegExp(`du\\s+kan\\s+${cap}${end}`, 'gi'),
    new RegExp(`du\\s+forstår\\s+${cap}${end}`, 'gi'),
    new RegExp(`solid(?:e)?\\s+(?:erfaring|viden|baggrund)\\s+(?:med|inden\\s+for|om|i)\\s+${cap}${end}`, 'gi'),
    new RegExp(`kompetencer\\s+(?:inden\\s+for|i)\\s+${cap}${end}`, 'gi'),
    new RegExp(`stærke\\s+kompetencer\\s+(?:inden\\s+for|i)\\s+${cap}${end}`, 'gi'),
    new RegExp(`flair\\s+for\\s+${cap}${end}`, 'gi'),
    new RegExp(`passion\\s+for\\s+${cap}${end}`, 'gi'),
    new RegExp(`interesse\\s+for\\s+${cap}${end}`, 'gi'),
    new RegExp(`arbejder\\s+med\\s+${cap}${end}`, 'gi'),
    new RegExp(`har\\s+arbejdet\\s+med\\s+${cap}${end}`, 'gi'),
    new RegExp(`baggrund\\s+(?:inden\\s+for|i|fra)\\s+${cap}${end}`, 'gi'),
    new RegExp(`forståelse\\s+for\\s+${cap}${end}`, 'gi'),
    new RegExp(`indsigt\\s+i\\s+${cap}${end}`, 'gi'),
    new RegExp(`(?:certificeret|certificering)\\s+i\\s+${cap}${end}`, 'gi'),
    new RegExp(`vi\\s+forventer(?:\\s+at\\s+du\\s+har)?\\s+${cap}${end}`, 'gi'),
    new RegExp(`vi\\s+s[øo]ger\\s+(?:en\\s+)?(?:\\w+\\s+)?(?:med|der\\s+har)\\s+${cap}${end}`, 'gi'),
    new RegExp(`det\\s+er\\s+en\\s+fordel\\s+(?:med|at\\s+have)\\s+${cap}${end}`, 'gi'),
    new RegExp(`gerne\\s+erfaring\\s+med\\s+${cap}${end}`, 'gi'),
    // Engelsk
    new RegExp(`experience\\s+(?:with|in|of)\\s+${cap}${end}`, 'gi'),
    new RegExp(`knowledge\\s+of\\s+${cap}${end}`, 'gi'),
    new RegExp(`proficient\\s+in\\s+${cap}${end}`, 'gi'),
    new RegExp(`proficiency\\s+(?:in|with)\\s+${cap}${end}`, 'gi'),
    new RegExp(`skilled\\s+in\\s+${cap}${end}`, 'gi'),
    new RegExp(`expertise\\s+in\\s+${cap}${end}`, 'gi'),
    new RegExp(`strong\\s+background\\s+in\\s+${cap}${end}`, 'gi'),
    new RegExp(`understanding\\s+of\\s+${cap}${end}`, 'gi'),
    new RegExp(`familiar(?:ity)?\\s+with\\s+${cap}${end}`, 'gi'),
    new RegExp(`ability\\s+to\\s+${cap}${end}`, 'gi'),
    new RegExp(`you\\s+have\\s+(?:experience\\s+(?:with|in)\\s+)?${cap}${end}`, 'gi'),
    new RegExp(`you\\s+(?:are|will\\s+be)\\s+(?:responsible\\s+for|working\\s+with)\\s+${cap}${end}`, 'gi'),
  ];

  patterns.forEach(re => {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(t)) !== null) {
      const phrase = (m[1]||'').trim().replace(/\s+/g,' ').replace(/[*•\-–]+$/, '').trim();
      if (phrase.length >= 2 && phrase.length <= 50 && !/^\d+$/.test(phrase) && !/^(og|eller|samt|en|et|at|de|den|det|the|and|or|a|an|in|of|for)$/.test(phrase))
        found.add(phrase);
    }
  });

  // ── Bullet-point extraction fra krav-sektion ────────────────────────────────
  // Mange jobopslag lister krav direkte som bullet points uden trigger-phrase
  const reqSection = text.match(
    /(?:krav|kvalifikationer|vi\s+s[øo]ger|du\s+har|du\s+bringer|requirements?|qualifications?|must[\s-]have|you\s+(?:have|bring))[\s\S]{0,30}\n([\s\S]{0,1200}?)(?:\n\n|\n[A-Z]|$)/i
  );
  if (reqSection) {
    const bullets = reqSection[1].split(/\n/);
    bullets.forEach(line => {
      const clean = line.replace(/^[\s•\-*–►▸✓✔\d\.]+/, '').trim();
      if (clean.length >= 3 && clean.length <= 60 && !/^\d+$/.test(clean)) {
        // Kun korte, præcise linjer (sandsynligvis en skill/krav)
        if (clean.split(' ').length <= 8) found.add(clean.toLowerCase());
      }
    });
  }

  return [...found];
}

/* ── Matcher et krav-udtryk mod CV-skills via direkte + synonym + normalisering ── */
function matchRequirementToCV(req, cvSkillNames) {
  const rn = req.toLowerCase().trim();
  const rnNorm = normalizeSkillName(rn); // oversæt evt. engelsk krav til dansk

  // 1. Direkte eller normaliseret substring-match mod CV-skills
  for (const sk of cvSkillNames) {
    if (sk.length < 2) continue;
    if (rn === sk || rnNorm === sk) return sk;
    if (rn.includes(sk) || sk.includes(rn)) return sk;
    if (rnNorm !== rn && (rnNorm.includes(sk) || sk.includes(rnNorm))) return sk;
  }

  // 2. Tjek engelske aliasser: kravet er på dansk men CV-skill er alias
  for (const [en, da] of Object.entries(SKILL_NORMALIZE)) {
    if (rn.includes(en) && cvSkillNames.includes(da)) return da;
    if (rn.includes(da) && cvSkillNames.includes(da)) return da;
  }

  // 3. Synonym-opslag: job-phrase → mappede skills → CV
  for (const [phrase, mapped] of Object.entries(SKILL_SYNONYMS)) {
    if (rn.includes(phrase) || phrase.includes(rn)) {
      for (const ms of mapped) {
        if (cvSkillNames.includes(ms)) return ms;
      }
    }
  }

  // 4. Word-overlap scoring: krav og skill deler nok ord til at det er et match
  const stopWords = new Set(['og','eller','med','for','til','af','en','et','er','i','på','at','de','den','det','the','and','or','a','an','in','of','for','with','strong','solid','good']);
  const rnWords = rn.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
  if (rnWords.length > 0) {
    let bestSk = null, bestScore = 0;
    for (const sk of cvSkillNames) {
      if (sk.length < 3) continue;
      const skWords = sk.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
      const hits = rnWords.filter(w => skWords.some(sw => sw.includes(w) || w.includes(sw))).length;
      const score = hits / Math.max(rnWords.length, skWords.length);
      if (score >= 0.6 && score > bestScore) { bestScore = score; bestSk = sk; }
    }
    if (bestSk) return bestSk;
  }

  return null;
}

/* ── Udtrækker krav-sektionen fra jobbeskrivelse (DK + EN) ─────────────────── */
function extractRequirementsSection(desc) {
  if (!desc) return '';
  const m = desc.match(
    /(?:krav|kvalifikationer|vi\s+s[øo]ger|du\s+har|du\s+bringer|dine\s+kvalifikationer|kompetencer|requirements?|qualifications?|what\s+you.ll\s+need|what\s+we.re\s+looking\s+for|must[\s-]have|you\s+have|you\s+bring)[\s:*•\-]*([\s\S]{0,900})/i
  );
  return m ? m[1] : desc.slice(0, 700);
}

/* ── 1. Skill Coverage: andel af jobbets krav CV'et dækker ─────────────────── */
function computeSkillCoverage(profile, job) {
  const reqSection  = extractRequirementsSection(job.description || '');
  const reqText     = norm(reqSection);
  const fullText    = norm(job.title + ' ' + job.description + ' ' + (job.keywords||[]).join(' '));

  // Jobbets skills = pre-computed keywords + extraction fra titel+krav-sektion
  const jobKwSet     = new Set((job.keywords||[]).map(k => norm(k)));
  const jobExtracted = extractSkillsFromText(job.title + ' ' + (job.keywords||[]).join(' ') + ' ' + reqSection);
  const jobSkillSet  = new Set([...jobKwSet, ...jobExtracted.map(s => norm(s.name))]);

  const cvMap = new Map(profile.skills.map(s => [norm(s.name), s]));
  const cvSkillNames = [...cvMap.keys()];
  const matched = [];
  let weightedCoverage = 0;

  // Pass 1: CV skills mod jobbets udtrukne skill-liste (direkte match)
  jobSkillSet.forEach(skill => {
    const cvSk = cvMap.get(skill);
    if (cvSk) {
      matched.push(cvSk.name);
      let w = cvSk.inferred ? 0.6 : 1.0;
      if (reqText.includes(skill)) w += 0.25; // skill er i krav-sektionen → ekstra vægt
      weightedCoverage += w;
    }
  });

  // Pass 2: scan CV skills direkte i fuld jobtekst (word-boundary regex)
  // Byg reverse-map: dansk skill-navn → alle engelske aliasser (fra SKILL_NORMALIZE)
  const daToEnAliases = {};
  Object.entries(SKILL_NORMALIZE).forEach(([en, da]) => {
    if (!daToEnAliases[da]) daToEnAliases[da] = [];
    daToEnAliases[da].push(en);
  });
  cvMap.forEach((sk, skillName) => {
    if (skillName.length < 3 || matched.includes(sk.name)) return;
    // Check alle varianter: det normaliserede navn + engelske aliasser
    const variants = [skillName, ...(daToEnAliases[skillName]||[])];
    const found = variants.some(v => {
      const esc = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(?<![\\w])${esc}(?![\\w])`, 'i').test(fullText);
    });
    if (found) {
      matched.push(sk.name);
      weightedCoverage += sk.inferred ? 0.4 : 0.75;
    }
  });

  // Pass 3: semantisk synonym-match — CV-skills via SKILL_SYNONYMS mod jobtekst
  // (fanger "databehandling" → pandas, "programmering" → python osv.)
  for (const [phrase, mappedSkills] of Object.entries(SKILL_SYNONYMS)) {
    if (!fullText.includes(phrase)) continue;
    for (const ms of mappedSkills) {
      if (matched.includes(ms)) continue;
      const cvSk = cvMap.get(ms);
      if (cvSk) {
        matched.push(cvSk.name);
        weightedCoverage += cvSk.inferred ? 0.5 : 0.85;
        break; // én synonym-match per phrase er nok
      }
    }
  }

  // Pass 4: NLP-udtræk af jobbets eksplicitte krav ("erfaring med X") → match mod CV
  const jobReqs = extractJobRequirements(job.description || '');
  let nlpMatches = 0;
  jobReqs.forEach(req => {
    const hit = matchRequirementToCV(req, cvSkillNames);
    if (hit && !matched.includes(hit)) {
      matched.push(hit);
      const cvSk = cvMap.get(hit);
      weightedCoverage += cvSk ? (cvSk.inferred ? 0.5 : 0.9) : 0.7;
      nlpMatches++;
    }
  });

  // Score: weighted coverage / jobbets skill-count (mindst 4 for ikke at over-score)
  // Bruger NLP-krav som denominator hvis vi fik nok ud af jobbet
  const effectiveDenominator = jobReqs.length >= 4
    ? Math.max(jobReqs.length, jobSkillSet.size, 4)
    : Math.max(jobSkillSet.size, 4);
  const score = Math.min(Math.round((weightedCoverage / effectiveDenominator) * 100), 100);
  return { score, matched, jobSkillSet, jobReqs, nlpMatches };
}

/* ── 2. Titel/Rolle-alignment: jobtitel vs. CV-roller + adjacent_roles ───────── */
function computeTitleAlignment(profile, job) {
  const jobTitle = norm(job.title);
  const STOP = new Set(['and','the','for','med','og','til','ved','som','hos','a','an','in','at','of','or']);
  const titleWords = jobTitle.split(/\s+/).filter(w => w.length > 3 && !STOP.has(w));

  let score = 30;

  // a) RoleFamily-nøgleord i jobtitel
  const FAMILY_KWS = {
    'Frontend':        ['frontend','react','vue','angular','ui developer','web developer','javascript developer'],
    'Backend':         ['backend','server','api developer','python developer','java developer','golang','node developer'],
    'Data & AI':       ['data scientist','data analyst','machine learning','analytics','bi ','data engineer','mlops'],
    'Design':          ['designer','ux','ui designer','product designer','grafisk','visual designer','art director'],
    'Produkt & Agile': ['product manager','product owner','scrum master','projektleder','agile coach'],
    'Marketing':       ['marketing','seo','content','brand','growth','communications','pr manager'],
    'Cloud & DevOps':  ['devops','platform engineer','infrastructure','cloud','sre ','site reliability'],
    'Mobile':          ['ios developer','android','mobile developer','react native','flutter'],
    'Forretning':      ['consultant','business analyst','strategy','forretnings','økonom','controller'],
  };
  if ((FAMILY_KWS[profile.roleFamily]||[]).some(k => jobTitle.includes(norm(k)))) score = Math.max(score, 78);

  // b) Match med CV-rollernes historik
  (profile.roles||[]).forEach(r => {
    const rWords = norm(r.title||'').split(/\s+/).filter(w => w.length > 3 && !STOP.has(w));
    const overlap = titleWords.filter(w => rWords.some(rw => rw.includes(w) || w.includes(rw))).length;
    if (overlap >= 2) score = Math.max(score, 92);
    else if (overlap === 1) score = Math.max(score, 68);
  });

  // c) Adjacent roles fra AI-analyse (nærliggende roller personen REALISTISK kan søge)
  (profile.adjacent_roles||[]).forEach(adj => {
    const adjN = norm(adj);
    const adjWords = adjN.split(/\s+/).filter(w => w.length > 4);
    const hits = titleWords.filter(w => adjWords.includes(w)).length;
    if (hits >= 2) score = Math.max(score, 80);
    else if (hits === 1) score = Math.max(score, 62);
    if (jobTitle.includes(adjN)) score = Math.max(score, 85);
  });

  // c2) Wildcard roles: "overraskende men realistiske" jobs AI fandt (fx barista→hospitality)
  (profile.wildcard_roles||[]).forEach(adj => {
    const adjN = norm(adj);
    const adjWords = adjN.split(/\s+/).filter(w => w.length > 4);
    const hits = titleWords.filter(w => adjWords.includes(w)).length;
    if (hits >= 2) score = Math.max(score, 72);
    else if (hits === 1) score = Math.max(score, 55);
    if (jobTitle.includes(adjN)) score = Math.max(score, 76);
  });

  // d) Industri-label som proxy
  const IND_SCORE = {
    'Frontend': profile.roleFamily==='Frontend'?90:(['Backend','Mobile','Data & AI'].includes(profile.roleFamily)?55:30),
    'Backend':  profile.roleFamily==='Backend'?90:(['Frontend','Cloud & DevOps','Data & AI'].includes(profile.roleFamily)?55:30),
    'Data & AI':profile.roleFamily==='Data & AI'?90:(['Backend','Forretning'].includes(profile.roleFamily)?55:30),
    'Design':   profile.roleFamily==='Design'?90:(profile.roleFamily==='Marketing'?60:30),
    'Marketing':profile.roleFamily==='Marketing'?90:(profile.roleFamily==='Forretning'?65:30),
    'Finans':   profile.roleFamily==='Forretning'?80:30,
    'Produkt':  profile.roleFamily==='Produkt & Agile'?90:(['Forretning','Frontend','Backend'].includes(profile.roleFamily)?60:30),
    'Ledelse':  ['Senior','Lead / Manager'].includes(profile.seniority)?75:40,
    'Cloud & DevOps': profile.roleFamily==='Cloud & DevOps'?90:(['Backend','Frontend'].includes(profile.roleFamily)?50:30),
    'Mobile':   profile.roleFamily==='Mobile'?90:(profile.roleFamily==='Frontend'?65:30),
  };
  if (IND_SCORE[job.industry]) score = Math.max(score, IND_SCORE[job.industry]);

  return Math.min(score, 100);
}

/* ── 3. Seniority fit: erfaring + retning ────────────────────────────────────── */
function computeSeniorityFit(profile, job, jobText) {
  const LEVELS = ['Junior','Mid-level','Senior','Lead / Manager'];
  const pLevel = LEVELS.indexOf(profile.seniority);

  let score = 70; // neutral

  // Udtræk reqYears fra job-data eller tekst
  const reqYears = job.reqYears ?? (() => {
    const m = jobText.match(/(\d+)\+?\s*(?:years?(?:\s+of)?|års?)\s*(?:erfaring|experience)/i);
    return m ? parseInt(m[1]) : null;
  })();

  if (reqYears != null) {
    const yrs  = profile.years ?? 0;
    const diff = yrs - reqYears;
    if (diff >= 0 && diff <= 3)       score = 100; // præcist match
    else if (diff > 3 && diff <= 7)   score = 82;  // lidt overqualified
    else if (diff > 7)                score = 65;  // meget overqualified
    else if (diff >= -1)              score = 68;  // lidt under
    else if (diff >= -2)              score = 45;  // noget under
    else                              score = 28;  // klart for lidt erfaring
  }

  // Seniority-label direkte sammenligning
  if (job.seniority && pLevel >= 0) {
    const jLevel = LEVELS.indexOf(job.seniority);
    if (jLevel >= 0) {
      const d = pLevel - jLevel;
      if (d === 0)       score = Math.min(score + 18, 100); // præcis match
      else if (d === 1)  score = Math.min(score + 6, 92);   // lidt overqualified
      else if (d === -1) score = Math.min(score - 8, 72);   // lidt underqualified
      else if (d <= -2)  score = Math.min(score - 20, 45);  // klart underqualified
      else if (d >= 2)   score = Math.min(score - 5, 70);   // overqualified
    }
  }

  // Bonus: nyuddannet + junior-job = godt match
  if ((profile.seniority === 'Junior' || (profile.years??10) < 3) &&
      (job.seniority === 'Junior' || /junior|graduate|entry.?level|nyuddannet|trainee/i.test(jobText)))
    score = Math.min(score + 12, 100);

  return Math.max(score, 10);
}

/* ── 4. Keyword density: CV's kontekstnøgleord i jobbet ──────────────────────── */
function computeKeywordDensity(profile, jobText) {
  // Vægtet liste: direkte skills > kontekst-nøgleord > domæner > adjacent roles
  const kws = [
    ...(profile.keywords||[]).slice(0,12).map(k => ({ k: norm(k), w: 1.0 })),
    ...(profile.context_keywords||[]).slice(0,8).map(k => ({ k: norm(k), w: 0.85 })),
    ...(profile.domains||[]).slice(0,4).map(k => ({ k: norm(k), w: 0.9 })),
    ...(profile.adjacent_roles||[]).slice(0,4).map(k => ({ k: norm(k), w: 0.55 })),
  ].filter(({k}) => k.length > 2);

  if (!kws.length) return 50;

  let hits = 0, total = 0;
  kws.forEach(({k,w}) => { total += w; if (jobText.includes(k)) hits += w; });

  // * 2 så en 50% hit-rate giver 100% (de fleste jobs nævner ikke alle keywords)
  return Math.min(Math.round((hits / total) * 200), 100);
}

/* ── 5. Domain match ─────────────────────────────────────────────────────────── */
function computeDomainMatch(profile, jobText) {
  const domains = (profile.domains||[]).map(d => norm(d));
  if (!domains.length) return 50;
  const hits = domains.filter(d => d.length > 3 && jobText.includes(d)).length;
  if (hits >= 2) return 90;
  if (hits === 1) return 72;
  return 40;
}

/* ── Transferable skills bonus (op til +20) ──────────────────────────────────── */
function getTransferBonus(profile, jobText) {
  if (!profile) return { bonus: 0, reasons: [] };
  const jt = jobText.toLowerCase();
  let bonus = 0;
  const reasons = [];

  (profile.domains||[]).forEach(domain => {
    const transfers = DOMAIN_TRANSFER_MAP[norm(domain)] || [];
    const hits = transfers.filter(t => jt.includes(t));
    if (hits.length) {
      bonus += Math.min(hits.length * 7, 16);
      reasons.push(`Transferable: ${domain} → ${hits[0]}`);
    }
  });

  // Adjacent roles mod jobtitel
  (profile.adjacent_roles||[]).forEach(role => {
    const rn = norm(role);
    const words = rn.split(/\s+/).filter(w => w.length > 4);
    const jobTitleNorm = jt.split(' ').slice(0,5).join(' ');
    if (words.some(w => jobTitleNorm.includes(w))) {
      bonus += 12;
      reasons.push(`Nærliggende rolle: ${role}`);
    }
  });

  return { bonus: Math.min(bonus, 20), reasons };
}

/* ── AI-kontekst-bonus: bruges kun når CV er AI-analyseret (+15 max) ─────────── */
function computeAIContextBonus(profile, jobText, jobTitle) {
  if (!profile?.aiAnalyzed) return 0;
  let bonus = 0;

  // adjacent_roles ord i jobtitel = stærkt signal
  (profile.adjacent_roles||[]).forEach(adj => {
    const adjWords = norm(adj).split(/\s+/).filter(w => w.length > 4);
    const hits = adjWords.filter(w => jobTitle.includes(w)).length;
    if (hits >= 2) bonus += 12;
    else if (hits === 1) bonus += 5;
  });

  // context_keywords i jobbet
  const ctxHits = (profile.context_keywords||[])
    .filter(k => k.length > 3 && jobText.includes(norm(k))).length;
  bonus += Math.min(ctxHits * 3, 9);

  return Math.min(bonus, 15);
}

/* ── Adfærdsbonus: justér score baseret på hvad brugeren har klikket på ──── */
function getBehaviorBonus(job, behavior) {
  if (!behavior) return 0;
  let bonus = 0;

  // Branche-præference: +/- 6 point
  const indClicks = behavior.industries || {};
  const totalInd  = Object.values(indClicks).reduce((s,v)=>s+v,0);
  if (totalInd >= 3 && job.industry && indClicks[job.industry]) {
    const share    = indClicks[job.industry] / totalInd;
    const expected = 1 / Math.max(Object.keys(indClicks).length, 1);
    bonus += Math.round((share - expected) / Math.max(expected, 0.01) * 4);
  }

  // Arbejdsform-præference: +/- 5 point
  const modeClicks = behavior.workModes || {};
  const totalMode  = Object.values(modeClicks).reduce((s,v)=>s+v,0);
  if (totalMode >= 3 && job.workMode && modeClicks[job.workMode]) {
    const share    = modeClicks[job.workMode] / totalMode;
    const expected = 1 / Math.max(Object.keys(modeClicks).length, 1);
    bonus += Math.round((share - expected) / Math.max(expected, 0.01) * 3);
  }

  return Math.min(Math.max(bonus, -8), 8);
}

/* ══════════════════════════════════════════════════════════════════════════════
   HOVED-SCORING FUNKTION
   ════════════════════════════════════════════════════════════════════════════ */
function scoreJob(profile, job, prefs, embScore=null, behavior=null) {
  if (!profile) return null;

  const jobText  = norm(job.title + ' ' + job.description + ' ' + (job.keywords||[]).join(' '));
  const jobTitle = norm(job.title);

  // ── Beskrivelseskvalitet: kort beskrivelse → dæmp skill-confidence ─────────
  const descLen = (job.description || '').length;
  const descQuality = descLen < 120 ? 0.6 : descLen < 300 ? 0.8 : 1.0;

  // ── Beregn alle dimensioner ────────────────────────────────────────────────
  const { score: rawCoverageScore, matched, jobSkillSet, jobReqs } = computeSkillCoverage(profile, job);
  const coverageScore = Math.round(rawCoverageScore * descQuality + rawCoverageScore * (1 - descQuality) * 0.5);

  const titleScore  = computeTitleAlignment(profile, job);
  const senScore    = computeSeniorityFit(profile, job, jobText);
  const kwScore     = computeKeywordDensity(profile, jobText);
  const domainScore = computeDomainMatch(profile, jobText);

  // ── Nyuddannet-portal: boost tydelige entry-level/graduate stillinger ──────
  const isGradJob = /junior|graduate|entry.?level|nyuddannet|trainee|lærling|praktikant|studiejob|student(?:er)?(?:medhjælper)?/i.test(job.title + ' ' + job.description);
  const isJunior  = (profile.years ?? 10) <= 2 || profile.seniority === 'Junior';
  const gradBonus = isGradJob && isJunior ? 8 : 0;

  // ── Lokations- og præferencedimensioner ───────────────────────────────────
  const locationScore  = computeLocationFit(job, prefs);
  const languageScore  = computeLanguageFit(profile, job);
  const educationScore = computeEducationFit(profile, jobText);
  const contractScore  = computeContractFit(job, prefs);

  // ── Bonuser ────────────────────────────────────────────────────────────────
  const transfer = getTransferBonus(profile, jobText);
  const aiBonus  = computeAIContextBonus(profile, jobText, jobTitle);
  const indBonus = prefs?.industries?.length && prefs.industries.includes(job.industry) ? 5 : 0;

  // ── Samlet score ───────────────────────────────────────────────────────────
  // Hvis vi har en embedding-score, blandes den ind med 15% vægt.
  // De øvrige dimensioner skaleres ned med faktor 0.85 så totalvægten = 1.
  const embW  = embScore != null ? 0.15 : 0;
  const scale = 1 - embW;

  const base = Math.round(
    (coverageScore  * 0.30 +  // Skills: hvad jobbet kræver, har du?
     titleScore     * 0.22 +  // Rolle-alignment: er det din type job?
     senScore       * 0.13 +  // Seniority: passer erfaringsniveauet?
     locationScore  * 0.12 +  // Lokation (base-andel — se tillig penalty nedenfor)
     kwScore        * 0.10 +  // Kontekstnøgleord: faglig kontekst
     languageScore  * 0.07 +  // Sprog: kræver jobbet dansk/engelsk?
     educationScore * 0.05 +  // Uddannelse: opfylder du formelle krav?
     contractScore  * 0.01    // Kontrakttype: fuldtid/studiejob/deltid
    ) * scale
    + (embScore ?? 0) * embW  // Semantisk embedding-lighed (0-100)
  );

  // ── Lokations-straf: separat additivt fradrag (udover vægten) ─────────────
  // Giver lokation reel bid — langt væk = markant lavere score.
  const hasUserLocation = !!prefs?.location;
  const locationPenalty = !hasUserLocation ? 0
    : locationScore >= 80 ? 0      // Samme by/cluster → ingen straf
    : locationScore >= 60 ? -4     // Tæt på (naboby, hybrid) → lille straf
    : locationScore >= 40 ? -12    // Forkert region → mærkbar straf
    : -22;                         // Anden landsdel → stor straf

  // Mobilitetsstraf: hvis brugeren valgte "kun min by" og jobbet er et andet sted
  const mobilityPenalty =
    prefs?.mobility === 'same_city' && locationScore < 70 ? -8 :
    prefs?.mobility === 'region'    && locationScore < 40 ? -6 :
    0;

  // Adfærdsbonus: lærer af hvad brugeren klikker/gemmer (+/- 8 point)
  const behaviorBonus = getBehaviorBonus(job, behavior);

  const rawTotal = base + transfer.bonus + aiBonus + indBonus + gradBonus
                 + locationPenalty + mobilityPenalty + behaviorBonus;

  // ── Relevans-gate: svage skills+titel begrænser totalen ───────────────────
  const relevance = coverageScore * 0.55 + titleScore * 0.45;
  const relevanceCap =
    relevance < 15 ? 44 :
    relevance < 28 ? 56 :
    relevance < 42 ? 70 :
    99;

  const total = Math.min(Math.max(rawTotal, 10), relevanceCap);

  // ── Forklaringer til brugeren ──────────────────────────────────────────────
  const reasons = [];

  // Skills-forklaring
  if (matched.length >= 4)
    reasons.push(`${matched.length} kompetencer matcher: ${matched.slice(0,3).join(', ')} m.fl.`);
  else if (matched.length > 0)
    reasons.push(`${matched.length} kompetencer matcher: ${matched.join(', ')}`);
  else if (transfer.reasons.length)
    reasons.push(transfer.reasons[0]);
  else if (jobReqs?.length > 0)
    reasons.push('Ingen direkte kompetence-overlap med jobbets krav');
  else
    reasons.push('Ingen kompetencedata at matche mod');

  // Titel/rolle
  if (titleScore >= 88)       reasons.push('Jobtitel matcher din faglige profil præcist');
  else if (titleScore >= 72)  reasons.push('Jobtitel er tæt på din faglige retning');
  else if (titleScore <= 35)  reasons.push('Jobtitlen ligger langt fra din uddannelsesretning');

  // Lokation
  if (locationScore >= 92)        reasons.push('Jobbet er i din by');
  else if (locationScore >= 72)   reasons.push('Jobbet er i din region');
  else if (locationScore <= 40 && hasUserLocation)
    reasons.push(`Jobbet er ikke i dit foretrukne område${mobilityPenalty < 0 ? ' (trækker ned)' : ''}`);
  else if (locationScore <= 60 && prefs?.mobility === 'same_city')
    reasons.push('Du søger kun lokalt — jobbet er lidt langt væk');

  // Seniority
  if (senScore >= 95)         reasons.push('Erfaringskrav passer præcist til dit niveau');
  else if (senScore < 35)     reasons.push('Kræver væsentligt mere erfaring end dit CV viser');
  else if (gradBonus > 0)     reasons.push('Entry-level stilling — god start for nyuddannet');

  // Sprog, uddannelse, bonus
  if (languageScore <= 35)    reasons.push('Kræver sprogkompetencer der ikke fremgår af CV');
  if (educationScore <= 45)   reasons.push('Uddannelseskrav er højere end dit niveau');
  if (aiBonus >= 10)          reasons.push('AI: din profil matcher denne rolleprofil godt');
  if (transfer.bonus >= 12)   reasons.push('Stærke transferable skills fra dit fagområde');
  if (embScore != null && embScore >= 65) reasons.push('Semantisk lighed: din profil minder om denne rolleprofil');
  if (behaviorBonus >= 5)     reasons.push('Matcher dine søgemønstre og præferencer');

  // ── Skill-gaps ──────────────────────────────────────────────────────────────
  const cvNormSet = new Set(profile.skills.map(s => norm(s.name)));
  const gaps = [...jobSkillSet].filter(s => !cvNormSet.has(s) && s.length > 2).slice(0, 4);

  return {
    total, coverageScore, titleScore, senScore, kwScore, domainScore,
    locationScore, languageScore, educationScore, contractScore,
    transferBonus: transfer.bonus, aiBonus, gradBonus, embScore, behaviorBonus,
    locationPenalty, mobilityPenalty,
    matched, gaps, reasons,
    descQuality, relevance,
  };
}

/* ── Lokations-normalisering + cluster-matching ──────────────────────────────── */
const CITY_CLUSTERS = {
  københavn: ['københavn','frederiksberg','gentofte','gladsaxe','lyngby','herlev','hvidovre',
    'rødovre','ballerup','brøndby','albertslund','glostrup','greve','taastrup','høje-taastrup',
    'ishøj','hellerup','søborg','vanløse','amager','valby','bispebjerg','nørrebro','østerbro',
    'vesterbro','copenhagen','copenhague','köpenhamn'],
  aarhus:    ['aarhus','viby j','brabrand','risskov','højbjerg','åbyhøj','lystrup','egå',
    'skejby','tranbjerg','beder','malling','arhus'],
  odense:    ['odense','svendborg','nyborg','kerteminde','middelfart','assens'],
  aalborg:   ['aalborg','nørresundby','storvorde','nibe','brønderslev'],
  esbjerg:   ['esbjerg','fanø','ribe'],
  vejle:     ['vejle','kolding','fredericia','horsens'],
};

function normalizeCity(loc) {
  return (loc||'').toLowerCase()
    .replace(/,?\s*(denmark|dk|danmark|dänemark)\b/gi,'')
    .replace(/\s+[cnsvø]\b/,'')  // fjern "København C", "Aarhus N"
    .replace(/\bgreater\s+/,'')
    .trim();
}

function getCityCluster(loc) {
  const l = normalizeCity(loc);
  if (!l) return null;
  for (const [cluster, cities] of Object.entries(CITY_CLUSTERS)) {
    if (cities.some(c => l.includes(c) || c.includes(l.split(' ')[0]))) return cluster;
  }
  return l.split(/[,\s]/)[0]; // Brug første ord som fallback cluster
}

/* ── 6. Location fit ─────────────────────────────────────────────────────────── */
function computeLocationFit(job, prefs) {
  // Remote = godt for alle
  if (job.workMode === 'Remote') return 95;

  const mobility = prefs?.mobility || 'anywhere';

  // Brugeren vil kun have remote
  if (mobility === 'remote_only') return job.workMode === 'Hybrid' ? 45 : 20;

  // Brugeren har ikke angivet by → neutral
  if (!prefs?.location) return job.workMode === 'Hybrid' ? 75 : 65;

  const userCluster = getCityCluster(prefs.location);
  const jobCluster  = getCityCluster(job.location || '');

  // Præcist cluster-match (fx begge i København-området)
  if (userCluster && jobCluster && userCluster === jobCluster) {
    return job.workMode === 'Hybrid' ? 100 : 95;
  }

  // Hele landet → afstand er OK
  if (mobility === 'anywhere') return job.workMode === 'Hybrid' ? 72 : 58;

  // Samme region (groft: begge på Sjælland, begge på Jylland, begge på Fyn)
  const SJAELLAND = ['københavn','roskilde','næstved','holbæk','slagelse','ringsted','køge'];
  const JYLLAND   = ['aarhus','aalborg','esbjerg','vejle','herning','viborg','randers','silkeborg','horsens','kolding','fredericia','holstebro','ikast'];
  const FYN       = ['odense','svendborg','nyborg'];
  const inSameRegion = (a,b,reg) => reg.some(r=>a?.includes(r)) && reg.some(r=>b?.includes(r));
  const sameRegion = inSameRegion(userCluster,jobCluster,SJAELLAND)
                  || inSameRegion(userCluster,jobCluster,JYLLAND)
                  || inSameRegion(userCluster,jobCluster,FYN);

  if (mobility === 'region') return sameRegion ? (job.workMode==='Hybrid'?78:65) : 30;

  // same_city og intet match
  return job.workMode === 'Hybrid' ? 52 : 30;
}

/* ── 7. Sprog-fit ────────────────────────────────────────────────────────────── */
function computeLanguageFit(profile, job) {
  const langs = (profile.languages||[]).map(l => l.toLowerCase());
  const hasDanish  = langs.some(l => l.includes('dansk'));
  const hasEnglish = langs.some(l => l.includes('engelsk') || l.includes('english'));
  const jobDesc    = (job.description||'').toLowerCase();
  const jobTitle   = (job.title||'').toLowerCase();
  const allText    = jobTitle + ' ' + jobDesc;

  // Kræver eksplicit dansk flydende?
  const requiresDanish = /(?:dansk\s+(?:flydende|på\s+højt\s+niveau|i\s+ord\s+og\s+skrift|modersmål)|native\s+danish|dansktalende)/i.test(allText);
  if (requiresDanish && !hasDanish) return 25; // hård straf

  // Er jobbet skrevet på dansk? (indikator for dansk-krav)
  const isDanishJob = (jobDesc.match(/\b(?:vi søger|du har|ansøgning|stilling|virksomhed|erfaring|medarbejder)\b/g)||[]).length >= 2;
  if (isDanishJob && !hasDanish) return 50; // moderat straf

  // Kræver engelsk?
  const requiresEnglish = /(?:english\s+(?:fluent|proficiency|required)|working\s+language\s+is\s+english|english\s+is\s+a\s+must)/i.test(allText);
  if (requiresEnglish && !hasEnglish) return 40;

  // Alt OK
  return 85;
}

/* ── 8. Uddannelses-fit ──────────────────────────────────────────────────────── */
function computeEducationFit(profile, jobText) {
  const LEVELS = { 'PhD':4, 'Kandidat':3, 'Bachelor':2, 'Gymnasial/EUD':1, 'Bootcamp/Selvlært':1 };
  const profileLevel = LEVELS[profile.education] ?? 0;

  const requiresPhD      = /\b(?:phd|ph\.d\.?|doktorgrad)\b/i.test(jobText);
  const requiresMaster   = /\b(?:kandidat(?:uddannelse|grad)?|cand\.|master(?:'?s)?|msc|m\.sc)\b/i.test(jobText);
  const requiresBachelor = /\b(?:bachelor(?:'?s)?|bsc|b\.sc|professionsbachelor)\b/i.test(jobText);

  if (requiresPhD)      return profileLevel >= 4 ? 100 : profileLevel === 3 ? 60 : 30;
  if (requiresMaster)   return profileLevel >= 3 ? 100 : profileLevel === 2 ? 68 : 42;
  if (requiresBachelor) return profileLevel >= 2 ? 100 : profileLevel >= 1 ? 78 : 55;
  return 78; // intet eksplicit krav
}

/* ── 9. Kontrakttype-fit ─────────────────────────────────────────────────────── */
function computeContractFit(job, prefs) {
  if (!prefs?.contractType || prefs.contractType === 'all') return 80; // neutral
  const jobType = (job.type||'').toLowerCase();
  const jTitle  = (job.title||'').toLowerCase();
  const allText = jobType + ' ' + jTitle;

  const isStudie  = /studiejob|student\s*job|studentermedhjælper/i.test(allText);
  const isPraktik = /praktik|trainee|internship|intern\b/i.test(allText);
  const isDeltid  = /deltid|part[\s-]?time/i.test(allText);
  const isFuldtid = !isStudie && !isPraktik && !isDeltid;

  if (prefs.contractType === 'studiejob') return isStudie ? 100 : isPraktik ? 70 : 35;
  if (prefs.contractType === 'praktik')   return isPraktik ? 100 : isStudie ? 70 : 35;
  if (prefs.contractType === 'deltid')    return isDeltid ? 100 : isPraktik ? 60 : 40;
  if (prefs.contractType === 'fuldtid')   return isFuldtid ? 100 : isDeltid ? 50 : 45;
  return 80;
}

/* ─── Discovery scoring: matcher job mod wildcard_roles ──────────────────── */
function discoveryScore(profile, job) {
  if (!profile?.wildcard_roles?.length) return null;
  const jt = norm(job.title + " " + job.description);
  const wildcards = profile.wildcard_roles.map(r => r.toLowerCase());

  let bestMatch = null;
  let bestScore = 0;

  wildcards.forEach(wRole => {
    const words = wRole.split(/\s+/).filter(w => w.length > 3);
    const matchCount = words.filter(w => jt.includes(w)).length;
    if (matchCount > 0) {
      const score = Math.round((matchCount / words.length) * 100);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = wRole;
      }
    }
  });

  if (!bestMatch) return null;

  return {
    score: Math.min(bestScore + 30, 85), // Discovery jobs capped at 85 to avoid false positives
    matchedRole: bestMatch,
    reasoning: profile.discovery_reasoning || '',
    working_style: profile.working_style || '',
  };
}

/* ═══════════════════════ JOBNET BROWSER FETCH ══════════════════════════════ */
const JOBNET_SEARCH = 'https://job.jobnet.dk/CV/FindWork/Search';

function parseJobnetData(data) {
  const postings = data.JobPositionPostings || [];
  return postings.map(p => {
    const jid      = String(p.JobPositionPostingIdentifier || '');
    const title    = (p.PositionTitle || '').trim();
    const company  = (p.HiringOrgName || '').trim();
    const city     = p.WorkPlaceCity || p.WorkPlaceName || '';
    const region   = p.WorkPlaceRegionName || '';
    const location = [city, region].filter(Boolean).join(', ') || 'Danmark';
    const rawDesc  = p.PresentationAgreement || p.JobPositionPostingDescription || '';
    const desc     = rawDesc.replace(/<[^>]+>/g,' ').replace(/\s{2,}/g,' ').trim().slice(0,1500);
    const posted   = p.PostingCreated || '';
    const deadline = (p.LastDateApplication || '').slice(0,10);
    const abroad   = !!p.WorkPlaceAbroad;
    const salaryM  = desc.match(/(\d[\d.,]+)\s*[-–]\s*(\d[\d.,]+)\s*(kr|DKK)/i);
    const salary   = salaryM ? `${salaryM[1]}–${salaryM[2]} kr/md` : '';
    const days     = posted ? Math.floor((Date.now()-new Date(posted))/86400000) : 99;
    const postedTxt= days===0?'I dag':days===1?'I går':days<7?`${days} dage siden`:days<14?'1 uge siden':`${days/7|0} uger siden`;
    const SKILL_KW = ['python','javascript','typescript','react','sql','java','golang','docker','kubernetes','aws','azure','figma','ux','scrum','agile','excel','power bi','kommunikation','ledelse','projektledelse','seo','b2b','saas'];
    const kws      = SKILL_KW.filter(k=>new RegExp(`(?<!\\w)${k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?!\\w)`,'i').test(title+' '+desc));
    const INDUSTRY = [['IT/Tech',['udvikler','developer','software','engineer','it ','frontend','backend']],['Design',['designer','ux','ui','grafisk','kreativ']],['Data & AI',['data scientist','analytiker','machine learning','bi ']],['Marketing',['marketing','seo','content','brand']],['Finans',['finans','økonomi','revisor','regnskab']],['Salg',['sælger','salg','account','sales']],['HR',['hr ','rekruttering','talent']],['Produkt',['product manager','product owner','projektleder']]];
    const txt      = (title+' '+desc).toLowerCase();
    const industry = (INDUSTRY.find(([,kws])=>kws.some(k=>txt.includes(k)))||['Andet'])[0];
    return { id:`jn-${jid}`, title, company, location, type: p.WorkHours||'Fuldtid', workMode: abroad?'Remote':'Kontor', salary, description:desc, keywords:kws, posted:postedTxt, deadline, url:`https://job.jobnet.dk/CV/FindWork/Details/${jid}`, source:'jobnet.dk', sourceLabel:'Jobnet', industry };
  });
}

async function fetchJobnetBrowser(offset=0, search='') {
  // Kalder Vercel serverless function /api/jobs (JSearch via RapidAPI)
  const params = new URLSearchParams({ offset, ...(search ? { q: search } : {}) });
  const r = await fetch(`/api/jobs?${params}`, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`/api/jobs HTTP ${r.status}`);
  const data = await r.json();
  if (data.error) throw new Error(data.error);
  // JSearch returnerer allerede parsede jobs
  if (Array.isArray(data.jobs)) return { jobs: data.jobs, total: data.total || data.jobs.length };
  // Fallback: prøv Jobnet-format
  const jobs = parseJobnetData(data);
  return { jobs, total: data.TotalResultCount || jobs.length };
}

/* ═══════════════════════ FILE PARSERS ══════════════════════════════════════ */
async function parsePDF(file) {
  await new Promise(res => {
    if (window['pdfjs-dist/build/pdf']) return res();
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload = res; document.head.appendChild(s);
  });
  const lib = window['pdfjs-dist/build/pdf'];
  lib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const buf = await file.arrayBuffer();
  const pdf = await lib.getDocument({ data: new Uint8Array(buf) }).promise;
  let text = '';
  for (let i = 1; i <= Math.min(pdf.numPages, 8); i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    text += tc.items.map(x=>x.str).join(' ') + '\n';
  }
  return text;
}

async function parseDOCX(file) {
  const buf = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buf });
  return result.value;
}

async function parseFileText(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'pdf') return parsePDF(file);
  if (['doc','docx'].includes(ext)) return parseDOCX(file);
  return new Promise((res,rej) => {
    const r = new FileReader();
    r.onload = e => res(e.target.result);
    r.onerror = rej;
    r.readAsText(file, 'utf-8');
  });
}

/* ═══════════════════════ MOCK JOBS ═════════════════════════════════════════ */
const MOCK_JOBS = [
  {id:"m1",title:"Senior Frontend Udvikler",company:"Lunar",location:"København K",workMode:"Hybrid",salary:"65.000–80.000 kr/md",description:"Vi søger en erfaren Frontend Udvikler til vores produktteam. Du bygger brugervenlige finansielle interfaces. Vi bruger React, TypeScript og GraphQL. Krav: React (5+ år erfaring), TypeScript, design systems, testing (Jest/Cypress), graphql.",keywords:["react","typescript","graphql","jest","design systems","css"],posted:"2 dage siden",deadline:"30. apr.",url:"https://job.jobnet.dk",source:"Jobnet",industry:"Fintech"},
  {id:"m2",title:"Product Manager – Growth",company:"Trustpilot",location:"København V",workMode:"Hybrid",salary:"60.000–75.000 kr/md",description:"Vi søger en datadriven Product Manager til at drive vores growth-initiativer med A/B tests og product discovery. Krav: 3+ år PM erfaring, A/B testing, sql, agile, scrum, okr, stakeholder management, jira.",keywords:["product management","a/b testing","sql","agile","scrum","okr","jira"],posted:"1 dag siden",deadline:"15. maj",url:"https://job.jobnet.dk",source:"LinkedIn",industry:"SaaS"},
  {id:"m3",title:"UX/UI Designer",company:"Veo Technologies",location:"København N",workMode:"Remote",salary:"50.000–65.000 kr/md",description:"Veo leder efter en passioneret designer til at forme brugeroplevelsen af vores sportsteknologi-platform. Krav: figma, brugertest, prototyping, design systems, user research, accessibility, 3+ år erfaring.",keywords:["figma","ux design","user research","prototyping","design systems","accessibility"],posted:"3 dage siden",deadline:"1. maj",url:"https://job.jobnet.dk",source:"The Hub",industry:"Design"},
  {id:"m4",title:"Data Scientist – NLP",company:"Siteimprove",location:"København",workMode:"Kontor",salary:"55.000–70.000 kr/md",description:"Siteimprove søger en Data Scientist med speciale i NLP. Krav: python, pandas, scikit-learn, pytorch, nlp, sql, machine learning, 3+ år erfaring. MSc eller tilsvarende foretrækkes.",keywords:["python","pandas","scikit-learn","pytorch","nlp","sql","machine learning"],posted:"5 dage siden",deadline:"20. maj",url:"https://job.jobnet.dk",source:"Jobindex",industry:"Data & AI"},
  {id:"m5",title:"Backend Udvikler – Go",company:"Pleo",location:"København",workMode:"Hybrid",salary:"70.000–90.000 kr/md",description:"Vi søger en stærk Backend Udvikler til at skalere vores transaktionsplatform. Krav: golang, microservices, kubernetes, postgresql, docker, api design, 4+ år erfaring.",keywords:["golang","microservices","kubernetes","postgresql","docker","api design"],posted:"1 uge siden",deadline:"10. maj",url:"https://job.jobnet.dk",source:"Ofir",industry:"Fintech"},
  {id:"m6",title:"DevOps / Platform Engineer",company:"Vestas Digital",location:"Aarhus",workMode:"Hybrid",salary:"58.000–73.000 kr/md",description:"Vi søger en DevOps Engineer til vores cloud-transformation. Krav: aws, terraform, kubernetes, docker, github actions, linux, bash, ci/cd, 5+ år erfaring.",keywords:["aws","terraform","kubernetes","docker","github actions","linux","bash","ci/cd"],posted:"6 dage siden",deadline:"5. maj",url:"https://job.jobnet.dk",source:"Jobnet",industry:"Cloud & DevOps"},
  {id:"m7",title:"Scrum Master / Agile Coach",company:"Novozymes",location:"Bagsværd",workMode:"Hybrid",salary:"57.000–72.000 kr/md",description:"Vi søger erfaren Scrum Master til at facilitere agile processer. Krav: scrum, agile, safe, kanban, jira, confluence, coaching, 5+ år erfaring.",keywords:["scrum","agile","safe","kanban","jira","confluence"],posted:"4 dage siden",deadline:"25. apr.",url:"https://job.jobnet.dk",source:"Jobindex",industry:"Produkt & Agile"},
  {id:"m8",title:"Marketing Manager – B2B",company:"Templafy",location:"København K",workMode:"Hybrid",salary:"52.000–65.000 kr/md",description:"Vi søger erfaren B2B Marketing Manager. Krav: b2b marketing, hubspot, seo, content marketing, google analytics, demand generation, 3+ år erfaring i SaaS.",keywords:["b2b marketing","hubspot","seo","content marketing","google analytics","saas"],posted:"3 dage siden",deadline:"30. apr.",url:"https://job.jobnet.dk",source:"Graduateland",industry:"Marketing"},
  {id:"m9",title:"Fullstack Udvikler – React/Node",company:"Visma",location:"København",workMode:"Hybrid",salary:"60.000–75.000 kr/md",description:"Visma søger en Fullstack Udvikler med stærke kompetencer i React og Node.js. Du arbejder i et selvstyrende team med fokus på kodekvalitet. Krav: react, node.js, typescript, postgresql, docker, rest api, 3+ år erfaring.",keywords:["react","node.js","typescript","postgresql","docker","rest api"],posted:"2 dage siden",deadline:"8. maj",url:"https://job.jobnet.dk",source:"Jobnet",industry:"Frontend"},
  {id:"m10",title:"Senior iOS Udvikler",company:"Joe & The Juice",location:"København K",workMode:"Hybrid",salary:"60.000–75.000 kr/md",description:"Vi bygger næste generation af vores kundeapp med millioner af globale brugere. Krav: swift, ios, react native, rest api, 4+ år erfaring i iOS udvikling.",keywords:["swift","ios","react native","rest api"],posted:"4 dage siden",deadline:"12. maj",url:"https://job.jobnet.dk",source:"The Hub",industry:"Mobile"},
  {id:"m11",title:"Business Intelligence Analytiker",company:"Ørsted",location:"København",workMode:"Kontor",salary:"50.000–63.000 kr/md",description:"Ørsted søger en BI Analytiker til at omdanne data til beslutningsgrundlag. Krav: power bi, sql, postgresql, excel, tableau, python, 3+ år erfaring med BI og dataviz.",keywords:["power bi","sql","tableau","excel","python","data science"],posted:"5 dage siden",deadline:"18. maj",url:"https://job.jobnet.dk",source:"Jobnet",industry:"Data & AI"},
  {id:"m12",title:"Cloud Architect – AWS",company:"Maersk Technology",location:"København K",workMode:"Hybrid",salary:"80.000–100.000 kr/md",description:"Maersk søger en erfaren Cloud Architect til at definere og implementere vores cloud-strategi på AWS. Krav: aws, terraform, kubernetes, microservices, api design, docker, linux, 8+ år erfaring.",keywords:["aws","terraform","kubernetes","microservices","docker","linux","api design"],posted:"1 uge siden",deadline:"22. maj",url:"https://job.jobnet.dk",source:"LinkedIn",industry:"Cloud & DevOps"},
];

/* ═══════════════════════ ICONS ══════════════════════════════════════════════ */
const ic = {
  upload: <svg fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>,
  check: <svg fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>,
  x: <svg fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  arrow: <svg fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>,
  back: <svg fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>,
  bookmark: <svg fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>,
  bookmarkF: <svg fill="currentColor" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>,
  link: <svg fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>,
  edit: <svg fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  refresh: <svg fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>,
  send: <svg fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  copy: <svg fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  loader: <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>,
  file: <svg fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  user: <svg fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
};
const Ic = ({n,s=15}) => {
  if(!ic[n]) return <span style={{display:'inline-flex',width:s,height:s}}/>;
  return <span style={{display:'inline-flex',alignItems:'center',flexShrink:0,width:s,height:s}}>{React.cloneElement(ic[n],{width:s,height:s})}</span>;
};

/* ═══════════════════════ SCORE BADGE ═══════════════════════════════════════ */
const Score = ({v,lg}) => {
  const col = v>=80?'var(--green)':v>=60?'var(--amber)':'var(--faint)';
  const bg  = v>=80?'var(--green-bg)':v>=60?'var(--amber-bg)':'var(--surface-high)';
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:4,padding:lg?'4px 9px':'2px 7px',background:bg,color:col,fontSize:lg?13:12,fontWeight:700,whiteSpace:'nowrap',letterSpacing:'.01em'}}>
      <span style={{width:5,height:5,background:col,display:'inline-block',flexShrink:0}}/>
      {v}%
    </span>
  );
};

/* ══ Hjælper: genbyg skillsByCategory + counts fra skills-array ══════════════ */
function rebuildProfile(base, newSkills) {
  const skillsByCategory = {};
  newSkills.forEach(s => {
    if (!skillsByCategory[s.cat]) skillsByCategory[s.cat] = [];
    skillsByCategory[s.cat].push(s);
  });
  return {
    ...base,
    skills: newSkills,
    skillsByCategory,
    keywords: newSkills.slice(0,25).map(s=>s.name),
    totalSkills: newSkills.length,
    explicitCount: newSkills.filter(s=>!s.inferred).length,
    inferredCount: newSkills.filter(s=>s.inferred).length,
  };
}

/* ── Kategori-farver til skill-kort ─────────────────────────────────────── */
const CAT_COLORS = {
  'Data & AI':        '#1a4a7a',
  'Frontend':         '#2d6a4f',
  'Backend':          '#1b4332',
  'Cloud & DevOps':   '#264653',
  'Mobile':           '#2c3e50',
  'Design':           '#6d3b47',
  'Produkt & Agile':  '#7b4f12',
  'Marketing':        '#4a1942',
  'Forretning':       '#1c3a4a',
  'Bløde':            '#3d405b',
  'Økonomi & Regnskab':'#3b4a2f',
  'Øvrige IT':        '#2e4057',
  'HR & Rekruttering':'#4a2c2a',
  'Jura & Compliance':'#2d3142',
  'Kommunikation':    '#5c4033',
  'Administration':   '#3a3a3a',
  'Handel & Service': '#4a3728',
  'Produktion & Teknik':'#2a3d2e',
  'Undervisning':     '#4a3010',
  'Sundhed & Omsorg': '#2a4a3a',
};

/* ═══════════════════════ PROFILE SCREEN ════════════════════════════════════ */
const ProfileScreen = ({ profile, jobs, onContinue, onReupload, onUpdateProfile, user }) => {
  const topCats = Object.entries(profile.skillsByCategory)
    .sort((a,b)=>b[1].length - a[1].length);

  // Navn: fra profil (AI-ekstraheret) → Supabase user → fallback
  const displayName = profile.name || profile.candidateName
    || (user?.user_metadata?.full_name)
    || (user?.email?.split('@')[0]?.replace(/[._]/g,' ')?.replace(/\b\w/g,c=>c.toUpperCase()))
    || '';
  const initials = displayName
    ? displayName.split(' ').filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('')
    : '?';

  return (
    <div style={{minHeight:'100vh',background:'var(--bg)'}}>
      {/* Nav */}
      <div style={{background:'rgba(251,249,244,0.95)',borderBottom:'1px solid var(--border)',backdropFilter:'blur(10px)',padding:'0 24px',height:52,display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:10}}>
        <Logo/>
        <div style={{display:'flex',gap:8}}>
          <button onClick={onReupload} style={{fontSize:13,color:'var(--muted)',padding:'5px 10px',border:'1px solid var(--border2)',display:'flex',alignItems:'center',gap:5,background:'transparent'}}>
            <Ic n="upload" s={13}/>Skift CV
          </button>
          <button onClick={onContinue} style={{fontSize:12,fontWeight:700,padding:'7px 18px',background:'var(--navy)',color:'#fff',display:'flex',alignItems:'center',gap:5,letterSpacing:'.05em',textTransform:'uppercase'}}>
            Se job-matches<Ic n="arrow" s={13}/>
          </button>
        </div>
      </div>

      <div style={{maxWidth:900,margin:'0 auto',padding:'32px 24px 64px'}}>

        {/* ── HERO KORT ────────────────────────────────────────────────────── */}
        <div style={{
          background:'linear-gradient(135deg,#0f2a4a 0%,#1a4a7a 60%,#1c5fa0 100%)',
          borderRadius:0,padding:'36px 40px',marginBottom:24,
          position:'relative',overflow:'hidden',
        }}>
          {/* Dekorativ cirkel */}
          <div style={{position:'absolute',right:-60,top:-60,width:280,height:280,borderRadius:'50%',background:'rgba(255,255,255,0.04)',pointerEvents:'none'}}/>
          <div style={{position:'absolute',right:80,bottom:-80,width:180,height:180,borderRadius:'50%',background:'rgba(255,255,255,0.03)',pointerEvents:'none'}}/>

          <div style={{display:'flex',alignItems:'flex-start',gap:20,position:'relative'}}>
            {/* Avatar */}
            <div style={{
              width:64,height:64,borderRadius:'50%',flexShrink:0,
              background:'rgba(255,255,255,0.15)',
              border:'2px solid rgba(255,255,255,0.25)',
              display:'flex',alignItems:'center',justifyContent:'center',
              fontSize:22,fontWeight:700,color:'#fff',letterSpacing:'.05em',
              fontFamily:'Manrope,sans-serif',
            }}>
              {initials}
            </div>

            <div style={{flex:1,minWidth:0}}>
              {/* AI-badge */}
              {profile.aiAnalyzed && (
                <div style={{display:'inline-flex',alignItems:'center',gap:5,fontSize:10,fontWeight:700,letterSpacing:'.08em',color:'rgba(255,255,255,0.6)',marginBottom:8,textTransform:'uppercase'}}>
                  <span style={{fontSize:8}}>✦</span> AI-ANALYSERET
                </div>
              )}
              {/* Navn */}
              {displayName && (
                <div style={{fontSize:13,color:'rgba(255,255,255,0.6)',fontWeight:500,marginBottom:4,letterSpacing:'.01em'}}>
                  {displayName}
                </div>
              )}
              {/* Rolle */}
              <h1 style={{fontSize:30,fontWeight:400,letterSpacing:'-.02em',fontFamily:'Newsreader,Georgia,serif',color:'#fff',margin:0,lineHeight:1.15}}>
                {profile.roleFamily}
              </h1>
              {/* Meta-tags */}
              <div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:14}}>
                {profile.seniority && (
                  <span style={{fontSize:12,padding:'3px 10px',background:'rgba(255,255,255,0.12)',color:'rgba(255,255,255,0.85)',fontWeight:500,border:'1px solid rgba(255,255,255,0.15)'}}>
                    {profile.seniority}
                  </span>
                )}
                {profile.years > 0 && (
                  <span style={{fontSize:12,padding:'3px 10px',background:'rgba(255,255,255,0.08)',color:'rgba(255,255,255,0.7)',border:'1px solid rgba(255,255,255,0.1)'}}>
                    {profile.years}+ års erfaring
                  </span>
                )}
                {profile.education && (
                  <span style={{fontSize:12,padding:'3px 10px',background:'rgba(255,255,255,0.08)',color:'rgba(255,255,255,0.7)',border:'1px solid rgba(255,255,255,0.1)'}}>
                    {profile.education}
                  </span>
                )}
                {profile.location && (
                  <span style={{fontSize:12,padding:'3px 10px',background:'rgba(255,255,255,0.08)',color:'rgba(255,255,255,0.7)',border:'1px solid rgba(255,255,255,0.1)'}}>
                    📍 {profile.location}
                  </span>
                )}
                {profile.languages?.length > 0 && (
                  <span style={{fontSize:12,padding:'3px 10px',background:'rgba(255,255,255,0.08)',color:'rgba(255,255,255,0.7)',border:'1px solid rgba(255,255,255,0.1)'}}>
                    {profile.languages.join(' · ')}
                  </span>
                )}
              </div>
            </div>

            {/* Stats-kolonner */}
            <div style={{display:'flex',gap:24,flexShrink:0,alignSelf:'center'}}>
              {[
                {n: profile.totalSkills, l:'kompetencer'},
                {n: Object.keys(profile.skillsByCategory).length, l:'kategorier'},
                {n: profile.roles?.length||0, l:'stillinger'},
              ].map(({n,l})=>(
                <div key={l} style={{textAlign:'center'}}>
                  <div style={{fontSize:28,fontWeight:700,color:'#fff',fontFamily:'Newsreader,Georgia,serif',lineHeight:1}}>{n}</div>
                  <div style={{fontSize:11,color:'rgba(255,255,255,0.5)',marginTop:3,letterSpacing:'.03em'}}>{l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Summary */}
          {profile.summary && (
            <div style={{marginTop:20,paddingTop:16,borderTop:'1px solid rgba(255,255,255,0.1)',fontSize:13,color:'rgba(255,255,255,0.65)',fontStyle:'italic',lineHeight:1.55,maxWidth:600}}>
              "{profile.summary}"
            </div>
          )}
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 300px',gap:16,alignItems:'start'}}>
          <div style={{display:'flex',flexDirection:'column',gap:14}}>

            {/* ── STYRKER ─────────────────────────────────────────────────── */}
            {profile.strengths?.length > 0 && (
              <div style={{background:'#fff',padding:'20px 24px'}}>
                <div style={{fontSize:10,fontWeight:700,letterSpacing:'.1em',color:'var(--muted)',textTransform:'uppercase',marginBottom:14,fontFamily:'Manrope,sans-serif'}}>STYRKER</div>
                <div style={{display:'flex',flexDirection:'column',gap:9}}>
                  {profile.strengths.map((s,i)=>(
                    <div key={i} style={{display:'flex',gap:10,alignItems:'flex-start'}}>
                      <div style={{width:18,height:18,background:'var(--green-bg)',border:'1px solid var(--green-bd)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginTop:1}}>
                        <Ic n="check" s={10}/>
                      </div>
                      <span style={{fontSize:13,color:'var(--text)',lineHeight:1.5}}>{s}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── KOMPETENCER ──────────────────────────────────────────────── */}
            <div style={{background:'#fff',padding:'20px 24px'}}>
              <div style={{fontSize:10,fontWeight:700,letterSpacing:'.1em',color:'var(--muted)',textTransform:'uppercase',marginBottom:16,fontFamily:'Manrope,sans-serif'}}>KOMPETENCER EFTER KATEGORI</div>
              <div style={{display:'flex',flexDirection:'column',gap:16}}>
                {topCats.map(([cat,skills])=>{
                  const accent = CAT_COLORS[cat] || '#2d3142';
                  return (
                    <div key={cat} style={{borderLeft:`3px solid ${accent}`,paddingLeft:14}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                        <span style={{fontSize:12,fontWeight:700,color:accent,letterSpacing:'.05em'}}>{cat}</span>
                        <span style={{fontSize:11,color:'var(--faint)'}}>{skills.length}</span>
                      </div>
                      <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                        {skills.map(s=>(
                          <span key={s.name} title={s.inferred?`Udledt (${s.confidence}%):`:`Direkte (${s.confidence}%)`} style={{
                            display:'inline-flex',alignItems:'center',gap:3,
                            fontSize:12,padding:'3px 9px',
                            background: s.inferred ? 'transparent' : `${accent}12`,
                            border: s.inferred ? '1px dashed rgba(0,0,0,0.13)' : `1px solid ${accent}28`,
                            color: s.inferred ? 'var(--muted)' : accent,
                            fontWeight: s.inferred ? 400 : 500,
                          }}>
                            {s.inferred && <span style={{fontSize:8,opacity:.6}}>✦</span>}
                            {s.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              {profile.inferredCount > 0 && (
                <div style={{marginTop:14,paddingTop:12,borderTop:'1px solid var(--border)',display:'flex',gap:14,flexWrap:'wrap'}}>
                  <span style={{fontSize:11,color:'var(--faint)',display:'flex',alignItems:'center',gap:5}}>
                    <span style={{display:'inline-block',width:10,height:10,background:'rgba(26,74,122,0.12)',border:'1px solid rgba(26,74,122,0.25)'}}/>
                    Direkte fra CV
                  </span>
                  <span style={{fontSize:11,color:'var(--faint)',display:'flex',alignItems:'center',gap:5}}>
                    <span style={{display:'inline-block',width:10,height:10,border:'1px dashed rgba(0,0,0,0.2)',background:'transparent'}}/>
                    ✦ Udledt fra kontekst
                  </span>
                </div>
              )}
            </div>

            {/* ── ERFARING ─────────────────────────────────────────────────── */}
            {profile.roles?.length > 0 && (
              <div style={{background:'#fff',padding:'20px 24px'}}>
                <div style={{fontSize:10,fontWeight:700,letterSpacing:'.1em',color:'var(--muted)',textTransform:'uppercase',marginBottom:14,fontFamily:'Manrope,sans-serif'}}>DETEKTEREDE STILLINGER</div>
                <div style={{display:'flex',flexDirection:'column',gap:0}}>
                  {profile.roles.map((r,i)=>(
                    <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:i<profile.roles.length-1?'1px solid var(--border)':'none'}}>
                      <div style={{display:'flex',alignItems:'center',gap:10}}>
                        <div style={{width:6,height:6,background:i===0?'var(--navy)':'var(--border2)',borderRadius:'50%',flexShrink:0}}/>
                        <span style={{fontSize:13,fontWeight:i===0?600:400,color:i===0?'var(--navy)':'var(--text)'}}>{r.title}</span>
                      </div>
                      {r.years && <span style={{fontSize:12,color:'var(--faint)'}}>{r.years}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── SIDEBAR ───────────────────────────────────────────────────── */}
          <div style={{display:'flex',flexDirection:'column',gap:14}}>

            {/* Top nøgleord */}
            <div style={{background:'#fff',padding:'18px 20px'}}>
              <div style={{fontSize:10,fontWeight:700,letterSpacing:'.1em',color:'var(--muted)',textTransform:'uppercase',marginBottom:12,fontFamily:'Manrope,sans-serif'}}>TOP NØGLEORD</div>
              <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                {profile.keywords.slice(0,18).map((k,i)=>(
                  <span key={k} style={{
                    fontSize:12,padding:'3px 8px',
                    background: i<6 ? 'var(--navy)' : i<12 ? 'var(--accent-bg)' : 'var(--surface-high)',
                    color: i<6 ? '#fff' : i<12 ? 'var(--navy)' : 'var(--muted)',
                    fontWeight: i<6 ? 600 : 400,
                  }}>
                    {k}
                  </span>
                ))}
              </div>
            </div>

            {/* Adjacent roller */}
            {profile.adjacent_roles?.length > 0 && (
              <div style={{background:'#fff',padding:'18px 20px'}}>
                <div style={{fontSize:10,fontWeight:700,letterSpacing:'.1em',color:'var(--muted)',textTransform:'uppercase',marginBottom:12,fontFamily:'Manrope,sans-serif'}}>REALISTISKE JOBTYPER</div>
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  {profile.adjacent_roles.slice(0,6).map((r,i)=>(
                    <div key={r} style={{display:'flex',alignItems:'center',gap:8,fontSize:13,color:i<3?'var(--navy)':'var(--muted)',fontWeight:i<3?500:400}}>
                      <span style={{fontSize:10,color:'var(--faint)'}}>→</span>{r}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Wildcard roller */}
            {profile.wildcard_roles?.length > 0 && (
              <div style={{background:'#fff',padding:'18px 20px',borderLeft:'3px solid var(--amber)'}}>
                <div style={{fontSize:10,fontWeight:700,letterSpacing:'.1em',color:'var(--amber)',textTransform:'uppercase',marginBottom:10,fontFamily:'Manrope,sans-serif'}}>✦ OVERRASK DIG SELV</div>
                <div style={{fontSize:12,color:'var(--muted)',marginBottom:10,lineHeight:1.4}}>{profile.discovery_reasoning?.split('.')[0]||'Uventede roller der passer til din profil'}</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                  {profile.wildcard_roles.slice(0,5).map(r=>(
                    <span key={r} style={{fontSize:12,padding:'3px 9px',background:'#fffbf0',border:'1px solid rgba(180,130,30,0.25)',color:'#7b5e10',fontWeight:500}}>{r}</span>
                  ))}
                </div>
              </div>
            )}

            {/* CTA */}
            <button onClick={onContinue} style={{
              padding:'14px',
              background:'var(--navy)',
              color:'#fff',fontWeight:700,fontSize:13,
              display:'flex',alignItems:'center',justifyContent:'center',gap:6,
              letterSpacing:'.05em',textTransform:'uppercase',
              border:'none',cursor:'pointer',
            }}>
              Se dine job-matches<Ic n="arrow" s={14}/>
            </button>
            <p style={{fontSize:11,color:'var(--faint)',textAlign:'center',lineHeight:1.5,margin:0}}>
              {jobs?.length > 0 ? `${jobs.length} jobs matches mod din profil` : 'Jobs hentes i baggrunden'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );

};

/* ═══════════════════════ PREFERENCES SCREEN ════════════════════════════════ */
const PREF_INDUSTRIES = ["IT/Tech","Data & AI","Design","Marketing","Salg","Finans","HR","Ledelse","Sundhed","Logistik","Handel","Andet"];
const PREF_WORK_MODES = [
  {val:"Remote",      icon:"🏠", label:"Remote"},
  {val:"Hybrid",      icon:"🔄", label:"Hybrid"},
  {val:"Kontor",      icon:"🏢", label:"Kontor"},
  {val:"Ligegyldigt", icon:"🤷", label:"Ligegyldigt"},
];
const PREF_SALARIES = ["Under 35k","35–50k","50–65k","65–80k","80k+"];
const PREF_STATUS = [
  {val:"aktiv",  label:"Aktivt søgende",      sub:"Klar til at starte hurtigt"},
  {val:"aaben",  label:"Åben for muligheder", sub:"Venter på det rigtige job"},
  {val:"kigger", label:"Bare kigger",         sub:"Ingen hast"},
];
const DANISH_CITIES = [
  'København','Aarhus','Odense','Aalborg','Frederiksberg','Esbjerg','Randers','Kolding',
  'Horsens','Vejle','Roskilde','Herning','Silkeborg','Næstved','Fredericia','Viborg',
  'Køge','Holstebro','Helsingør','Hillerød','Slagelse','Holbæk','Svendborg',
  'Sønderborg','Ikast','Skive','Aabenraa','Ringsted','Nykøbing F','Haslev',
];

// By-grupper per landsdel – brugt i dropdown
const CITY_REGIONS = [
  { label: 'Storkøbenhavn & Sjælland', cities: [
    'København','Frederiksberg','Helsingør','Hillerød','Roskilde','Køge',
    'Næstved','Ringsted','Holbæk','Slagelse','Nykøbing F','Haslev','Lyngby','Glostrup','Hvidovre','Brøndby',
  ]},
  { label: 'Fyn', cities: [
    'Odense','Svendborg','Nyborg','Middelfart','Assens',
  ]},
  { label: 'Sydjylland', cities: [
    'Vejle','Kolding','Esbjerg','Fredericia','Sønderborg','Aabenraa','Haderslev','Ribe',
  ]},
  { label: 'Midtjylland', cities: [
    'Aarhus','Herning','Silkeborg','Viborg','Horsens','Ikast','Holstebro','Skive','Randers',
  ]},
  { label: 'Nordjylland', cities: [
    'Aalborg','Hjørring','Frederikshavn','Thisted','Hobro','Brønderslev',
  ]},
  { label: 'Bornholm', cities: ['Rønne'] },
];

// Alle byer fladt (bruges til match-funktioner)
const ALL_DANISH_CITIES_FLAT = CITY_REGIONS.flatMap(r => r.cities);

/* ── Foreslår brancher baseret på CV-profilen ───────────────────────────────── */
function suggestIndustriesFromProfile(profile) {
  if (!profile) return [];
  const suggested = new Set();

  const rfMap = {
    'Frontend':         ['IT/Tech'],
    'Backend':          ['IT/Tech'],
    'Mobile':           ['IT/Tech'],
    'Cloud & DevOps':   ['IT/Tech'],
    'Data & AI':        ['IT/Tech','Data & AI'],
    'Design':           ['Design','IT/Tech'],
    'Produkt & Agile':  ['IT/Tech','Ledelse'],
    'Marketing':        ['Marketing'],
    'Forretning':       ['Salg','Finans'],
    'HR & Rekruttering':['HR'],
    'Økonomi & Regnskab':['Finans'],
    'Sundhed & Omsorg': ['Sundhed'],
    'Produktion & Teknik':['Logistik','Handel'],
    'Handel & Service': ['Handel','Salg'],
    'Kommunikation':    ['Marketing'],
    'Undervisning':     ['Andet'],
    'Jura & Compliance':['Finans','Andet'],
    'Administration':   ['Ledelse','Finans'],
  };

  (rfMap[profile.roleFamily] || []).forEach(i => suggested.add(i));

  // Kig på domains for ekstra hints
  const domainText = (profile.domains || []).join(' ').toLowerCase();
  if (/sundhed|medicin|klinisk|patient|pharma/.test(domainText)) suggested.add('Sundhed');
  if (/finans|bank|investering|revision|regnskab/.test(domainText)) suggested.add('Finans');
  if (/marketing|branding|kommunikation|pr/.test(domainText)) suggested.add('Marketing');
  if (/salg|salgsledelse|account/.test(domainText)) suggested.add('Salg');
  if (/hr|rekruttering|personale/.test(domainText)) suggested.add('HR');
  if (/logistik|lager|supply chain|transport/.test(domainText)) suggested.add('Logistik');
  if (/handel|detailhandel|butik|retail/.test(domainText)) suggested.add('Handel');
  if (/ledelse|management|direktør/.test(domainText)) suggested.add('Ledelse');
  if (/data|analyse|bi|analytics|machine learning/.test(domainText)) suggested.add('Data & AI');
  if (/design|ux|ui|grafisk/.test(domainText)) suggested.add('Design');

  // Mindst 1 – fallback til Andet
  if (suggested.size === 0) suggested.add('Andet');

  return [...suggested].filter(i => PREF_INDUSTRIES.includes(i));
}
const PREF_MOBILITY = [
  {val:'same_city',    label:'Kun min by',    sub:'Maks ~30 min transport'},
  {val:'region',       label:'Min region',     sub:'Op til ~1 times transport'},
  {val:'anywhere',     label:'Hele landet',    sub:'Åben for at flytte'},
  {val:'remote_only',  label:'Kun remote',     sub:'Hjemmearbejde er et krav'},
];
const PREF_CONTRACT = [
  {val:'all',        label:'Alle typer'},
  {val:'fuldtid',    label:'Fuldtid'},
  {val:'deltid',     label:'Deltid'},
  {val:'studiejob',  label:'Studiejob'},
  {val:'praktik',    label:'Praktik / Trainee'},
];

const PrefChip = ({selected, onClick, children}) => (
  <button onClick={onClick} style={{
    padding:'7px 14px', fontSize:12, fontWeight:selected?700:400,
    border:`1.5px solid ${selected?'var(--navy)':'var(--border2)'}`,
    background:selected?'var(--navy)':'transparent',
    color:selected?'#fff':'var(--text)',
    transition:'all .14s', cursor:'pointer', fontFamily:'Manrope,sans-serif',
    letterSpacing:selected?'.02em':0,
  }}>{children}</button>
);

const PrefRadio = ({selected, onClick, label, sub}) => (
  <button onClick={onClick} style={{
    display:'flex',alignItems:'center',gap:12,padding:'11px 14px',width:'100%',
    border:`1.5px solid ${selected?'var(--navy)':'var(--border2)'}`,
    background:selected?'var(--accent-bg)':'transparent',
    textAlign:'left',cursor:'pointer',transition:'all .14s',
  }}>
    <div style={{width:16,height:16,borderRadius:'50%',border:`1.5px solid ${selected?'var(--navy)':'var(--border2)'}`,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',background:selected?'var(--navy)':'transparent'}}>
      {selected&&<div style={{width:5,height:5,borderRadius:'50%',background:'#fff'}}/>}
    </div>
    <div>
      <div style={{fontSize:13,fontWeight:selected?600:400,color:selected?'var(--navy)':'var(--text)'}}>{label}</div>
      {sub&&<div style={{fontSize:11,color:'var(--muted)',marginTop:1}}>{sub}</div>}
    </div>
  </button>
);

const PreferencesScreen = ({profile, onDone, onReupload}) => {
  const suggestedIndustries = suggestIndustriesFromProfile(profile);
  const [industries, setIndustries] = useState(suggestedIndustries);
  const [city,        setCity]        = useState(() => {
    // Auto-match CV location til en dansk by
    const loc = (profile.location || '').toLowerCase();
    const match = ALL_DANISH_CITIES_FLAT.find(c => loc.includes(c.toLowerCase()) || c.toLowerCase().includes(loc));
    return match || '';
  });
  const [mobility,    setMobility]    = useState('same_city');
  const [contractType,setContractType]= useState('all');

  const toggleIndustry = ind =>
    setIndustries(prev => prev.includes(ind) ? prev.filter(x=>x!==ind) : [...prev, ind]);

  const handleDone = () => onDone({
    industries,
    status: 'aaben',
    location: city,
    mobility,
    contractType,
  });

  const SectionLabel = ({n, children}) => (
    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
      <div style={{width:20,height:20,background:'var(--navy)',color:'#fff',fontSize:10,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{n}</div>
      <span style={{fontSize:13,fontWeight:600}}>{children}</span>
    </div>
  );

  return (
    <div style={{minHeight:'100vh', background:'var(--bg)'}}>
      <div style={{background:'rgba(251,249,244,0.92)',borderBottom:'1px solid var(--border)',backdropFilter:'blur(8px)',padding:'0 24px',height:52,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <Logo/>
        <button onClick={onReupload} style={{fontSize:13,color:'var(--muted)',padding:'5px 10px',border:'1px solid var(--border2)',display:'flex',alignItems:'center',gap:5}}>
          <Ic n="upload" s={13}/>Skift CV
        </button>
      </div>

      <div style={{maxWidth:600, margin:'0 auto', padding:'36px 24px'}}>
        <div style={{marginBottom:32, textAlign:'center'}}>
          <div style={{width:44,height:44,background:'var(--green-bg)',border:'1px solid var(--green-bd)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px',fontSize:20}}>✓</div>
          <h1 style={{fontSize:26,fontWeight:400,letterSpacing:'-.02em',marginBottom:6,fontFamily:'Newsreader,Georgia,serif'}}>Profil klar!</h1>
          <p style={{color:'var(--muted)',fontSize:14,lineHeight:1.6}}>3 hurtige spørgsmål — vi bruger svarene til at beregne præcise match-scores.</p>
        </div>

        <div style={{display:'flex',flexDirection:'column',gap:20}}>

          {/* Q1: Lokation */}
          <div style={{background:'var(--surface-low)',padding:'18px 20px'}}>
            <SectionLabel n="1">Hvor er du baseret?</SectionLabel>
            <select
              value={city}
              onChange={e => setCity(e.target.value)}
              style={{width:'100%',padding:'9px 12px',border:'1px solid var(--border2)',fontSize:13,background:'var(--bg)',boxSizing:'border-box',outline:'none',color: city ? 'var(--text)' : 'var(--muted)',marginBottom:14,appearance:'auto'}}
            >
              <option value="">Vælg din by...</option>
              {CITY_REGIONS.map(region => (
                <optgroup key={region.label} label={region.label}>
                  {region.cities.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <div style={{fontSize:12,color:'var(--muted)',fontWeight:500,marginBottom:10}}>Mobilitet</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
              {PREF_MOBILITY.map(({val,label,sub})=>(
                <PrefRadio key={val} selected={mobility===val} onClick={()=>setMobility(val)} label={label} sub={sub}/>
              ))}
            </div>
          </div>

          {/* Q2: Kontrakttype */}
          <div style={{background:'var(--surface-low)',padding:'18px 20px'}}>
            <SectionLabel n="2">Hvilken type stilling søger du?</SectionLabel>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              {PREF_CONTRACT.map(({val,label})=>(
                <PrefChip key={val} selected={contractType===val} onClick={()=>setContractType(val)}>
                  {label}
                </PrefChip>
              ))}
            </div>
          </div>

          {/* Q3: Brancher */}
          <div style={{background:'var(--surface-low)',padding:'18px 20px'}}>
            <SectionLabel n="3">Hvilke brancher interesserer dig?</SectionLabel>
            {suggestedIndustries.length > 0 && (
              <div style={{fontSize:12,color:'var(--muted)',marginBottom:10,display:'flex',alignItems:'center',gap:5}}>
                <span style={{color:'var(--green)',fontWeight:600}}>✓</span>
                Foreslået fra dit CV — tilpas efter behov
              </div>
            )}
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              {PREF_INDUSTRIES.map(ind=>(
                <PrefChip key={ind} selected={industries.includes(ind)} onClick={()=>toggleIndustry(ind)}>
                  {ind}
                </PrefChip>
              ))}
            </div>
          </div>

          <button onClick={handleDone} style={{padding:'14px',background:'var(--navy)',color:'#fff',fontWeight:700,fontSize:13,display:'flex',alignItems:'center',justifyContent:'center',gap:8,letterSpacing:'.05em'}}>
            Se mine job-matches <Ic n="arrow" s={15}/>
          </button>
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════ JOB ROW ════════════════════════════════════════════ */
const JobRow = ({job,match,selected,onSelect,saved,applied,onSave,discoveryLabel}) => {
  const [hov,setHov]=useState(false);
  return (
    <div onClick={onSelect} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{display:'flex',alignItems:'flex-start',gap:10,padding:'11px 14px',paddingLeft: discoveryLabel ? 17 : 14, borderLeft:`3px solid ${selected?'var(--navy)':discoveryLabel?'var(--amber)':'transparent'}`,borderBottom:'1px solid var(--border)',background:selected?'var(--surface-low)':hov?'var(--surface-low)':'var(--bg)',cursor:'pointer',transition:'background .14s'}}>
      <div style={{position:'relative',flexShrink:0}}>
        <div style={{width:34,height:34,background:'var(--surface-high)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:14,color:'var(--muted)'}}>
          {job.company[0]}
        </div>
        {applied&&<div style={{position:'absolute',top:-3,right:-3,width:10,height:10,background:'var(--green)',border:'2px solid var(--surface)'}}/>}
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:6}}>
          <span style={{fontSize:13,fontWeight:selected?600:400,color:selected?'var(--navy)':'var(--text)',lineHeight:1.3}}>{job.title}</span>
          <div style={{display:'flex',alignItems:'center',gap:5,flexShrink:0}}>
            {applied&&<span style={{fontSize:10,padding:'1px 6px',background:'var(--green-bg)',color:'var(--green)',border:'1px solid var(--green-bd)',fontWeight:600}}>Ansøgt</span>}
            {match && <Score v={match.total}/>}
            <button onClick={e=>{e.stopPropagation();onSave(job.id)}} style={{color:saved?'var(--navy)':'var(--faint)',padding:'1px',transition:'color .14s'}}>
              <Ic n={saved?'bookmarkF':'bookmark'} s={13}/>
            </button>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6,marginTop:2,flexWrap:'wrap'}}>
          <span style={{fontSize:12,color:'var(--muted)',fontWeight:500}}>{job.company}</span>
          <span style={{color:'var(--border)',fontSize:10}}>·</span>
          <span style={{fontSize:11,color:'var(--faint)'}}>{job.location}</span>
          <span style={{color:'var(--border)',fontSize:10}}>·</span>
          <span style={{fontSize:11,color:'var(--faint)'}}>{job.workMode}</span>
          {job.posted&&<><span style={{color:'var(--border)',fontSize:10}}>·</span><span style={{fontSize:11,color:'var(--faint)'}}>{job.posted}</span></>}
        </div>
        {discoveryLabel && (
          <div style={{marginTop:4,display:'flex',alignItems:'center',gap:4}}>
            <span style={{fontSize:10,padding:'1px 6px',background:'var(--amber-bg)',border:'1px solid var(--amber-bd)',color:'var(--amber)',fontWeight:600}}>🔭 {discoveryLabel}</span>
          </div>
        )}
        {!discoveryLabel && match?.matched?.length>0 && (
          <div style={{display:'flex',gap:4,marginTop:4,flexWrap:'wrap'}}>
            {match.matched.slice(0,3).map(k=>(
              <span key={k} style={{fontSize:10,padding:'1px 6px',background:'var(--green-bg)',border:'1px solid var(--green-bd)',color:'var(--green)',fontWeight:500}}>{k}</span>
            ))}
            {match.matched.length>3&&<span style={{fontSize:10,color:'var(--faint)'}}>+{match.matched.length-3}</span>}
          </div>
        )}
      </div>
    </div>
  );
};

/* ═══════════════════════ JOB DETAIL ═════════════════════════════════════════ */
const JobDetail = ({job,match,saved,onSave,applied,onApply,profile}) => {
  const [appState,setAppState]=useState('idle'); // idle|gen|done
  const [appText,setAppText]=useState('');
  const [edit,setEdit]=useState(false);
  const [copied,setCopied]=useState(false);

  // ── On-demand AI job-analyse ───────────────────────────────────────────────
  const [aiJobMatch, setAiJobMatch] = useState(null);
  const [aiJobLoading, setAiJobLoading] = useState(false);

  useEffect(() => {
    if (!job?.description || !profile) return;
    setAiJobMatch(null);
    setAiJobLoading(true);

    fetch(`${API_BASE}/api/analyze-job`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({title: job.title, description: job.description}),
    })
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (!data || data.error) { setAiJobLoading(false); return; }

      const required   = (data.required_skills || []).map(s => s.toLowerCase());
      const niceToHave = (data.nice_to_have    || []).map(s => s.toLowerCase());
      // CV-navne: inkl. normaliserede engelske aliasser for matching
      const cvNames    = new Set(profile.skills.map(s => s.name.toLowerCase()));
      // Udvid cvNames med engelske aliasser (fx "strategi" → tilføj "strategy" til settet)
      const cvNamesExpanded = new Set(cvNames);
      Object.entries(SKILL_NORMALIZE).forEach(([en, da]) => {
        if (cvNames.has(da)) cvNamesExpanded.add(en);
        if (cvNames.has(en)) cvNamesExpanded.add(da);
      });

      // Direkte match (bruger udvidet sæt)
      const matched = required.filter(s => cvNamesExpanded.has(s));
      // Synonym-match: required_skill → synonym → cv skill
      const synonymMatched = [];
      required.forEach(req => {
        if (matched.includes(req)) return;
        // Prøv normalisering af req mod cvNames
        const normReq = normalizeSkillName(req);
        if (cvNames.has(normReq) && !synonymMatched.includes(req)) {
          synonymMatched.push(req);
          return;
        }
        for (const [phrase, mappedSkills] of Object.entries(SKILL_SYNONYMS)) {
          if (req.includes(phrase) || phrase.includes(req)) {
            const hit = mappedSkills.find(ms => cvNamesExpanded.has(ms));
            if (hit && !synonymMatched.includes(req)) { synonymMatched.push(req); break; }
          }
        }
      });

      const allMatched = [...matched, ...synonymMatched];
      const gaps = required.filter(s => !allMatched.includes(s)).slice(0, 6);
      const coverageScore = required.length > 0
        ? Math.min(Math.round((allMatched.length / required.length) * 100), 100)
        : null;

      setAiJobMatch({
        matched: allMatched,
        synonymMatched,
        gaps,
        coverageScore,
        niceToHaveMissing: niceToHave.filter(s => !cvNames.has(s)).slice(0,3),
        keyRequirements: data.key_requirements || [],
        totalRequired: required.length,
      });
      setAiJobLoading(false);
    })
    .catch(() => setAiJobLoading(false));
  }, [job?.id]);

  const generate = useCallback(() => {
    setAppState('gen'); setEdit(false);
    const topSkills = match?.matched?.slice(0,3).join(', ') || profile?.keywords?.slice(0,3).join(', ') || 'relevante kompetencer';
    const years = profile?.years ? `${profile.years}+ år` : 'solid';
    const sen = profile?.seniority || '';
    const letter =
`Kære ${job.company},

Jeg søger stillingen som ${job.title} med stor interesse.

Med ${years} erfaring som ${sen.toLowerCase()} profil inden for ${profile?.roleFamily || 'mit fagområde'} og dokumenterede kompetencer i ${topSkills}, er jeg overbevist om, at jeg kan bidrage meningsfuldt til jeres team.

Det, der tiltrækker mig ved ${job.company}, er jeres fokus på ${job.industry}${job.keywords?.length ? ` og det konkrete arbejde med ${job.keywords.slice(0,2).join(' og ')}` : ''}. Jeg er vant til at navigere i ${(job.workMode||'hybrid').toLowerCase()} miljøer og leverer resultater både selvstændigt og i tæt samarbejde med andre.

${match?.gaps?.length ? `Jeg er desuden i gang med at udvide min profil med ${match.gaps.slice(0,2).join(' og ')}, som jeg ser som naturlige næste skridt.` : 'Jeg arbejder struktureret, kommunikerer klart og er hurtig til at sætte mig ind i nye domæner.'}

Jeg ser frem til en samtale om, hvordan jeg kan bidrage til ${job.company}s vækst og mål.

Med venlig hilsen

[Dit navn]`;

    let i=0;
    const iv = setInterval(()=>{
      i+=12;
      if(i>=letter.length){setAppText(letter);setAppState('done');clearInterval(iv);}
      else setAppText(letter.slice(0,i));
    },14);
  },[job,match,profile]);

  return (
    <div style={{height:'100%',overflowY:'auto'}}>
      <div style={{padding:'18px 22px'}}>
        {/* Header */}
        <div style={{marginBottom:16}}>
          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:10}}>
            <h1 style={{fontSize:20,fontWeight:400,lineHeight:1.25,flex:1,fontFamily:'Newsreader,Georgia,serif'}}>{job.title}</h1>
            <button onClick={()=>onSave(job.id)} style={{display:'flex',alignItems:'center',gap:5,padding:'6px 10px',border:'1px solid var(--border2)',fontSize:12,color:saved?'var(--navy)':'var(--muted)',background:'transparent',whiteSpace:'nowrap',flexShrink:0}}>
              <Ic n={saved?'bookmarkF':'bookmark'} s={13}/>{saved?'Gemt':'Gem'}
            </button>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8,marginTop:6,flexWrap:'wrap'}}>
            <span style={{fontWeight:500,fontSize:14}}>{job.company}</span>
            <span style={{color:'var(--border)'}}>·</span>
            <span style={{fontSize:13,color:'var(--muted)'}}>{job.location}</span>
            <span style={{color:'var(--border)'}}>·</span>
            <span style={{fontSize:13,color:'var(--muted)'}}>{job.workMode}</span>
            {job.salary&&<><span style={{color:'var(--border)'}}>·</span><span style={{fontSize:13,color:'var(--muted)'}}>{job.salary}</span></>}
          </div>
          <div style={{display:'flex',gap:6,marginTop:8,flexWrap:'wrap',alignItems:'center'}}>
            {match&&<Score v={match.total} lg/>}
            {job.industry&&<span style={{fontSize:12,padding:'2px 8px',background:'var(--surface-high)',color:'var(--muted)'}}>{job.industry}</span>}
            <span style={{fontSize:12,color:'var(--faint)'}}>via {job.source}</span>
            {job.deadline&&<span style={{fontSize:12,color:'var(--faint)'}}>· Frist {job.deadline}</span>}
          </div>
        </div>

        {/* Action row */}
        <div style={{display:'flex',gap:7,marginBottom:18}}>
          <button onClick={generate} disabled={appState==='gen'}
            style={{display:'flex',alignItems:'center',gap:5,padding:'9px 18px',background:'var(--navy)',color:'#fff',fontSize:12,fontWeight:700,letterSpacing:'.05em',opacity:appState==='gen'?.7:1}}>
            {appState==='gen'?<span className="spin"><Ic n="loader" s={13}/></span>:null}
            {appState==='idle'?'Skriv ansøgning':'Skriv ny ansøgning'}
          </button>
          <a href={job.url} target="_blank" rel="noreferrer"
            style={{display:'inline-flex',alignItems:'center',gap:5,padding:'8px 13px',border:'1px solid var(--border2)',fontSize:13,color:'var(--text)',background:'transparent'}}>
            <Ic n="link" s={13}/>Se opslag
          </a>
        </div>

        {/* Match breakdown */}
        {match && (
          <div style={{background:'var(--surface-low)',padding:14,marginBottom:16}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
              <div style={{fontSize:10,fontWeight:700,letterSpacing:'.08em',color:'var(--muted)',textTransform:'uppercase',fontFamily:'Manrope,sans-serif'}}>MATCH-ANALYSE</div>
              {aiJobLoading && (
                <span style={{fontSize:10,color:'var(--muted)',display:'flex',alignItems:'center',gap:4}}>
                  <span style={{display:'inline-block',width:8,height:8,border:'1.5px solid var(--navy)',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
                  AI analyserer job…
                </span>
              )}
              {aiJobMatch && (
                <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',background:'var(--navy)',color:'#fff',letterSpacing:'.05em'}}>
                  ✦ AI-analyseret
                </span>
              )}
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              {[
                // Brug AI-beregnet skills hvis tilgængeligt, ellers det regelbaserede
                {l:'Skills', v: aiJobMatch?.coverageScore ?? match.coverageScore ?? match.skillScore,
                  sub: aiJobMatch ? `${aiJobMatch.matched.length}/${aiJobMatch.totalRequired} krav` : null},
                {l:'Rolle',           v:match.titleScore     ?? match.roleScore},
                {l:'Semantisk lighed',v:match.embScore!=null ? Math.round(match.embScore) : null,
                  sub: match.embScore!=null ? 'AI embedding' : null},
                {l:'Lokation',        v:match.locationScore},
                {l:'Erfaringsniveau', v:match.senScore},
                {l:'Sprog',           v:match.languageScore},
                {l:'Uddannelse',      v:match.educationScore},
              ].filter(({v})=>v!=null).map(({l,v,sub})=>(
                <div key={l}>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:4}}>
                    <span style={{color:'var(--muted)'}}>{l}{sub && <span style={{fontSize:10,color:'var(--faint)',marginLeft:4}}>{sub}</span>}</span>
                    <span style={{fontWeight:500,color:v>=75?'var(--green)':v>=50?'var(--amber)':'var(--faint)'}}>{v}%</span>
                  </div>
                  <div style={{height:2,background:'var(--surface-high)'}}>
                    <div className="bar" style={{height:3,width:`${v}%`,background:v>=75?'var(--green)':v>=50?'var(--amber)':'var(--faint)'}}/>
                  </div>
                </div>
              ))}
            </div>

            {/* Bonusbadges */}
            {(match.aiBonus > 0 || match.transferBonus > 0) && (
              <div style={{display:'flex',gap:6,marginTop:10,flexWrap:'wrap'}}>
                {match.aiBonus > 0 && (
                  <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',background:'var(--navy)',color:'#fff',letterSpacing:'.05em'}}>
                    ✦ AI +{match.aiBonus}
                  </span>
                )}
                {match.transferBonus > 0 && (
                  <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',background:'var(--accent-bg)',color:'var(--navy)',border:'1px solid var(--border2)',letterSpacing:'.03em'}}>
                    ↗ Transferable +{match.transferBonus}
                  </span>
                )}
              </div>
            )}

            {/* AI job-analyse: matchende kompetencer */}
            {(aiJobMatch?.matched?.length > 0 || match.matched?.length > 0) && (
              <div style={{marginTop:10}}>
                <span style={{fontSize:11,color:'var(--muted)',fontWeight:500}}>
                  {aiJobMatch ? 'Dine kompetencer der dækker jobbets krav:' : 'Dine matchende kompetencer:'}
                </span>
                <div style={{display:'flex',flexWrap:'wrap',gap:4,marginTop:5}}>
                  {(aiJobMatch?.matched || match.matched).map(k=>(
                    <span key={k} style={{fontSize:11,padding:'2px 7px',background:'var(--green-bg)',border:'1px solid var(--green-bd)',color:'var(--green)',fontWeight:500}}>{k}</span>
                  ))}
                </div>
              </div>
            )}

            {/* AI job-analyse: kompetencegab */}
            {(aiJobMatch?.gaps?.length > 0 || match.gaps?.length > 0) && (
              <div style={{marginTop:8}}>
                <span style={{fontSize:11,color:'var(--muted)',fontWeight:500}}>
                  {aiJobMatch ? `Jobbets krav du mangler (${aiJobMatch.gaps.length} af ${aiJobMatch.totalRequired}):` : 'Kompetencegab (ikke i dit CV):'}
                </span>
                <div style={{display:'flex',flexWrap:'wrap',gap:4,marginTop:5}}>
                  {(aiJobMatch?.gaps || match.gaps).map(k=>(
                    <span key={k} style={{fontSize:11,padding:'2px 7px',background:'#FFF8F0',border:'1px solid #FDCFA4',color:'var(--amber)',fontWeight:500}}>{k}</span>
                  ))}
                </div>
              </div>
            )}

            {/* AI: nøglekrav */}
            {aiJobMatch?.keyRequirements?.length > 0 && (
              <div style={{marginTop:8,borderTop:'1px solid var(--border)',paddingTop:8}}>
                <span style={{fontSize:11,color:'var(--muted)',fontWeight:500}}>AI: Vigtigste krav i jobbet</span>
                <div style={{marginTop:4,display:'flex',flexDirection:'column',gap:2}}>
                  {aiJobMatch.keyRequirements.slice(0,4).map((r,i)=>(
                    <div key={i} style={{fontSize:11,color:'var(--text)',display:'flex',gap:5}}>
                      <span style={{color:'var(--faint)',flexShrink:0}}>·</span>{r}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{marginTop:10,display:'flex',flexDirection:'column',gap:4}}>
              {match.reasons.map((r,i)=>(
                <div key={i} style={{fontSize:12,color:'var(--muted)',display:'flex',gap:5,alignItems:'flex-start'}}>
                  <span style={{color:i===0?'var(--green)':'var(--faint)',flexShrink:0,marginTop:1}}><Ic n="check" s={11}/></span>{r}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        <div style={{marginBottom:16}}>
          <div style={{fontSize:10,fontWeight:700,letterSpacing:'.08em',color:'var(--muted)',textTransform:'uppercase',fontFamily:'Manrope,sans-serif',marginBottom:10}}>OM STILLINGEN</div>
          <p style={{fontSize:13,lineHeight:1.75,color:'var(--text)'}}>{job.description}</p>
          {job.keywords?.length>0 && (
            <div style={{display:'flex',flexWrap:'wrap',gap:5,marginTop:10}}>
              {job.keywords.map(k=>(
                <span key={k} style={{fontSize:11,padding:'2px 8px',background:'var(--surface-high)',color:'var(--muted)'}}>{k}</span>
              ))}
            </div>
          )}
        </div>

        {/* Application */}
        {(appState==='gen'||appState==='done') && (
          <div className="fade" style={{background:'var(--surface-low)',overflow:'hidden',marginBottom:16}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',borderBottom:'1px solid var(--border)',background:'var(--bg)'}}>
              <span style={{fontSize:10,fontWeight:700,letterSpacing:'.08em',color:'var(--muted)',textTransform:'uppercase',fontFamily:'Manrope,sans-serif'}}>ANSØGNING</span>
              {appState==='done' && (
                <div style={{display:'flex',gap:5}}>
                  <TinyBtn onClick={()=>setEdit(e=>!e)} icon="edit">{edit?'Vis':'Rediger'}</TinyBtn>
                  <TinyBtn onClick={()=>{navigator.clipboard?.writeText(appText);setCopied(true);setTimeout(()=>setCopied(false),2e3);}} icon="copy">{copied?'Kopieret!':'Kopiér'}</TinyBtn>
                  <TinyBtn onClick={generate} icon="refresh">Ny version</TinyBtn>
                </div>
              )}
            </div>
            <div style={{padding:14}}>
              {edit ? (
                <textarea value={appText} onChange={e=>setAppText(e.target.value)}
                  style={{width:'100%',minHeight:240,padding:'10px',border:'1px solid var(--border2)',fontSize:13,lineHeight:1.75,resize:'vertical',fontFamily:'inherit',outline:'none'}}
                  onFocus={e=>e.target.style.borderColor='var(--navy)'}
                  onBlur={e=>e.target.style.borderColor='var(--border)'}/>
              ) : (
                <div style={{fontSize:13,lineHeight:1.75,whiteSpace:'pre-wrap',color:'var(--text)'}}>
                  {appText}{appState==='gen'&&<span className="cursor"/>}
                </div>
              )}
            </div>
            {appState==='done' && (
              <div style={{padding:'10px 14px',borderTop:'1px solid var(--border)',background:'var(--bg)',display:'flex',gap:7}}>
                <button onClick={()=>!applied&&onApply&&onApply(job)}
                  style={{flex:1,padding:'9px',background:applied?'var(--green)':'var(--navy)',color:'#fff',fontSize:12,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',gap:5,transition:'background .14s',cursor:applied?'default':'pointer',letterSpacing:'.05em'}}>
                  <Ic n={applied?'check':'send'} s={13}/>{applied?'✓ Markeret som ansøgt':'Marker som ansøgt'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
const TinyBtn=({onClick,children,icon})=>(
  <button onClick={onClick} style={{display:'flex',alignItems:'center',gap:4,padding:'3px 8px',border:'1px solid var(--border2)',fontSize:11,color:'var(--muted)',background:'transparent'}}>
    <Ic n={icon} s={11}/>{children}
  </button>
);

/* ═══════════════════════ PROFILE DASHBOARD ═════════════════════════════════ */
const APPLIED_STATUSES = [
  {val:'ansøgt',  label:'Ansøgt',       color:'var(--navy)'},
  {val:'samtale', label:'Til samtale',  color:'var(--amber)'},
  {val:'tilbud',  label:'Fået tilbud',  color:'var(--green)'},
  {val:'afvist',  label:'Afvist',       color:'var(--faint)'},
];

const PrefRow = ({label,val,icon}) => (
  <div style={{marginBottom:10}}>
    <div style={{fontSize:11,color:'var(--faint)',marginBottom:2}}>{label}</div>
    <div style={{fontSize:13,fontWeight:500,color:'var(--text)'}}>{icon?`${icon} `:''}{val||'—'}</div>
  </div>
);

const ProfileDashboard = ({profile,prefs,savedIds,appliedJobs,jobsDB,matches,onSelectJob,onApplyStatus,onReupload,user}) => {
  const topMatch = useMemo(()=>{
    const vals = Object.values(matches).filter(Boolean).map(m=>m.total);
    return vals.length ? Math.max(...vals) : null;
  },[matches]);

  const savedJobObjs = useMemo(()=>
    savedIds.map(id=>jobsDB.find(j=>j.id===id)).filter(Boolean)
  ,[savedIds,jobsDB]);

  const topCats = useMemo(()=>
    Object.entries(profile?.skillsByCategory||{}).sort((a,b)=>b[1].length-a[1].length)
  ,[profile]);

  // Samme navne-logik som ProfileScreen
  const displayName = profile?.name || profile?.candidateName
    || (user?.user_metadata?.full_name)
    || (user?.email?.split('@')[0]?.replace(/[._]/g,' ')?.replace(/\b\w/g,c=>c.toUpperCase()))
    || '';
  const initials = displayName
    ? displayName.split(' ').filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('')
    : (profile?.roleFamily||'CV').split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();

  return (
    <div style={{flex:1,overflowY:'auto',background:'var(--bg)'}}>
      <div style={{maxWidth:900,margin:'0 auto',padding:'24px 20px 48px'}}>

        {/* ── HERO ─────────────────────────────────────────────────────────── */}
        <div style={{
          background:'linear-gradient(135deg,#0f2a4a 0%,#1a4a7a 60%,#1c5fa0 100%)',
          padding:'32px 36px',marginBottom:20,
          position:'relative',overflow:'hidden',
        }}>
          {/* Decorative circles */}
          <div style={{position:'absolute',right:-60,top:-60,width:280,height:280,borderRadius:'50%',background:'rgba(255,255,255,0.04)',pointerEvents:'none'}}/>
          <div style={{position:'absolute',right:80,bottom:-80,width:180,height:180,borderRadius:'50%',background:'rgba(255,255,255,0.03)',pointerEvents:'none'}}/>

          <div style={{display:'flex',alignItems:'flex-start',gap:20,position:'relative'}}>
            {/* Avatar */}
            <div style={{
              width:64,height:64,borderRadius:'50%',flexShrink:0,
              background:'rgba(255,255,255,0.15)',
              border:'2px solid rgba(255,255,255,0.25)',
              display:'flex',alignItems:'center',justifyContent:'center',
              fontSize:22,fontWeight:700,color:'#fff',letterSpacing:'.05em',
              fontFamily:'Manrope,sans-serif',
            }}>{initials}</div>

            <div style={{flex:1,minWidth:0}}>
              {profile?.aiAnalyzed&&(
                <div style={{display:'inline-flex',alignItems:'center',gap:5,fontSize:10,fontWeight:700,letterSpacing:'.08em',color:'rgba(255,255,255,0.6)',marginBottom:8,textTransform:'uppercase'}}>
                  <span style={{fontSize:8}}>✦</span> AI-ANALYSERET
                </div>
              )}
              {displayName&&(
                <div style={{fontSize:13,color:'rgba(255,255,255,0.6)',fontWeight:500,marginBottom:4,letterSpacing:'.01em'}}>{displayName}</div>
              )}
              <h2 style={{fontSize:28,fontWeight:400,letterSpacing:'-.02em',fontFamily:'Newsreader,Georgia,serif',color:'#fff',margin:0,lineHeight:1.15}}>
                {profile?.roleFamily||'Din profil'}
              </h2>
              <div style={{display:'flex',flexWrap:'wrap',gap:7,marginTop:12}}>
                {profile?.seniority&&<span style={{fontSize:12,padding:'3px 10px',background:'rgba(255,255,255,0.12)',color:'rgba(255,255,255,0.85)',fontWeight:500,border:'1px solid rgba(255,255,255,0.15)'}}>{profile.seniority}</span>}
                {profile?.years>0&&<span style={{fontSize:12,padding:'3px 10px',background:'rgba(255,255,255,0.08)',color:'rgba(255,255,255,0.7)',border:'1px solid rgba(255,255,255,0.1)'}}>{profile.years}+ års erfaring</span>}
                {profile?.education&&<span style={{fontSize:12,padding:'3px 10px',background:'rgba(255,255,255,0.08)',color:'rgba(255,255,255,0.7)',border:'1px solid rgba(255,255,255,0.1)'}}>{profile.education}</span>}
                {profile?.location&&<span style={{fontSize:12,padding:'3px 10px',background:'rgba(255,255,255,0.08)',color:'rgba(255,255,255,0.7)',border:'1px solid rgba(255,255,255,0.1)'}}>📍 {profile.location}</span>}
                {profile?.languages?.length>0&&<span style={{fontSize:12,padding:'3px 10px',background:'rgba(255,255,255,0.08)',color:'rgba(255,255,255,0.7)',border:'1px solid rgba(255,255,255,0.1)'}}>{profile.languages.join(' · ')}</span>}
              </div>
            </div>

            {/* Stats + Opdater CV */}
            <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:16,flexShrink:0}}>
              <button onClick={onReupload} style={{fontSize:12,color:'rgba(255,255,255,0.7)',padding:'6px 12px',border:'1px solid rgba(255,255,255,0.2)',display:'flex',alignItems:'center',gap:5,background:'rgba(255,255,255,0.08)',cursor:'pointer'}}>
                <Ic n="upload" s={12}/>Opdater CV
              </button>
              <div style={{display:'flex',gap:22}}>
                {[
                  {n:profile?.totalSkills||0,   l:'kompetencer'},
                  {n:topCats.length,              l:'kategorier'},
                  {n:topMatch!=null?`${topMatch}%`:'—', l:'top match'},
                ].map(({n,l})=>(
                  <div key={l} style={{textAlign:'center'}}>
                    <div style={{fontSize:24,fontWeight:700,color:'#fff',fontFamily:'Newsreader,Georgia,serif',lineHeight:1}}>{n}</div>
                    <div style={{fontSize:10,color:'rgba(255,255,255,0.5)',marginTop:3,letterSpacing:'.03em'}}>{l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {profile?.summary&&(
            <div style={{marginTop:18,paddingTop:14,borderTop:'1px solid rgba(255,255,255,0.1)',fontSize:13,color:'rgba(255,255,255,0.65)',fontStyle:'italic',lineHeight:1.55,maxWidth:600,position:'relative'}}>
              "{profile.summary}"
            </div>
          )}
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 280px',gap:16,alignItems:'start'}}>
          {/* ── VENSTRE KOLONNE ─────────────────────────────────────────────── */}
          <div style={{display:'flex',flexDirection:'column',gap:14}}>

            {/* Stats strip */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}>
              {[
                {label:'Gemte jobs',           val:savedIds.length,           color:'#B45309'},
                {label:'Ansøgte jobs',          val:appliedJobs.length,        color:'var(--green)'},
                {label:'Udledt fra kontekst',   val:profile?.inferredCount||0, color:'#3a5a80'},
              ].map(({label,val,color})=>(
                <div key={label} style={{background:'#fff',padding:'14px 16px'}}>
                  <div style={{fontSize:26,fontWeight:800,color,marginBottom:2,fontFamily:'Newsreader,Georgia,serif'}}>{val}</div>
                  <div style={{fontSize:11,color:'var(--muted)'}}>{label}</div>
                </div>
              ))}
            </div>

            {/* Kompetencer */}
            <div style={{background:'#fff',padding:'20px 24px'}}>
              <div style={{fontSize:10,fontWeight:700,letterSpacing:'.1em',color:'var(--muted)',textTransform:'uppercase',marginBottom:16,fontFamily:'Manrope,sans-serif'}}>KOMPETENCER EFTER KATEGORI</div>
              <div style={{display:'flex',flexDirection:'column',gap:16}}>
                {topCats.map(([cat,skills])=>{
                  const accent = CAT_COLORS[cat]||'#2d3142';
                  return (
                    <div key={cat} style={{borderLeft:`3px solid ${accent}`,paddingLeft:14}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                        <span style={{fontSize:12,fontWeight:700,color:accent,letterSpacing:'.05em'}}>{cat}</span>
                        <span style={{fontSize:11,color:'var(--faint)'}}>{skills.length}</span>
                      </div>
                      <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                        {skills.map(s=>(
                          <span key={s.name} title={s.inferred?`Udledt (${s.confidence}%):`:`Direkte (${s.confidence}%)`} style={{
                            display:'inline-flex',alignItems:'center',gap:3,
                            fontSize:12,padding:'3px 9px',
                            background:s.inferred?'transparent':`${accent}12`,
                            border:s.inferred?'1px dashed rgba(0,0,0,0.13)':`1px solid ${accent}28`,
                            color:s.inferred?'var(--muted)':accent,
                            fontWeight:s.inferred?400:500,
                          }}>
                            {s.inferred&&<span style={{fontSize:8,opacity:.6}}>✦</span>}
                            {s.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              {(profile?.inferredCount||0)>0&&(
                <div style={{marginTop:14,paddingTop:12,borderTop:'1px solid var(--border)',display:'flex',gap:14,flexWrap:'wrap'}}>
                  <span style={{fontSize:11,color:'var(--faint)',display:'flex',alignItems:'center',gap:5}}>
                    <span style={{display:'inline-block',width:10,height:10,background:'rgba(26,74,122,0.12)',border:'1px solid rgba(26,74,122,0.25)'}}/>Direkte fra CV
                  </span>
                  <span style={{fontSize:11,color:'var(--faint)',display:'flex',alignItems:'center',gap:5}}>
                    <span style={{display:'inline-block',width:10,height:10,border:'1px dashed rgba(0,0,0,0.2)',background:'transparent'}}/>✦ Udledt fra kontekst
                  </span>
                </div>
              )}
            </div>

            {/* Stillinger */}
            {profile?.roles?.length>0&&(
              <div style={{background:'#fff',padding:'20px 24px'}}>
                <div style={{fontSize:10,fontWeight:700,letterSpacing:'.1em',color:'var(--muted)',textTransform:'uppercase',marginBottom:14,fontFamily:'Manrope,sans-serif'}}>DETEKTEREDE STILLINGER</div>
                {profile.roles.map((r,i)=>(
                  <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 0',borderBottom:i<profile.roles.length-1?'1px solid var(--border)':'none'}}>
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                      <div style={{width:6,height:6,background:i===0?'var(--navy)':'var(--border2)',borderRadius:'50%',flexShrink:0}}/>
                      <span style={{fontSize:13,fontWeight:i===0?600:400,color:i===0?'var(--navy)':'var(--text)'}}>{r.title}</span>
                    </div>
                    {r.years&&<span style={{fontSize:12,color:'var(--faint)'}}>{r.years}</span>}
                  </div>
                ))}
              </div>
            )}

            {/* Gemte jobs */}
            <div style={{background:'#fff'}}>
              <div style={{padding:'14px 20px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div style={{fontSize:10,fontWeight:700,letterSpacing:'.1em',color:'var(--muted)',textTransform:'uppercase',fontFamily:'Manrope,sans-serif'}}>GEMTE JOB</div>
                <span style={{fontSize:12,color:'var(--faint)'}}>{savedJobObjs.length} job</span>
              </div>
              {savedJobObjs.length===0
                ? <div style={{padding:'24px',textAlign:'center',color:'var(--faint)',fontSize:13}}>Ingen gemte job endnu — tryk på bogmærke-ikonet på et job</div>
                : savedJobObjs.map((j,i)=>(
                  <button key={j.id} onClick={()=>onSelectJob(j)}
                    style={{width:'100%',display:'flex',alignItems:'center',gap:12,padding:'12px 20px',borderBottom:i<savedJobObjs.length-1?'1px solid var(--border)':'none',background:'transparent',textAlign:'left',cursor:'pointer',transition:'background .14s'}}
                    onMouseEnter={e=>e.currentTarget.style.background='var(--surface-high)'}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <div style={{width:34,height:34,background:'var(--surface-high)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:13,color:'var(--muted)',flexShrink:0}}>{j.company[0]}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{j.title}</div>
                      <div style={{fontSize:12,color:'var(--muted)'}}>{j.company} · {j.location}</div>
                    </div>
                    {matches[j.id]&&<Score v={matches[j.id].total}/>}
                    <Ic n="arrow" s={13}/>
                  </button>
                ))
              }
            </div>

            {/* Ansøgte jobs */}
            <div style={{background:'#fff'}}>
              <div style={{padding:'14px 20px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div style={{fontSize:10,fontWeight:700,letterSpacing:'.1em',color:'var(--muted)',textTransform:'uppercase',fontFamily:'Manrope,sans-serif'}}>ANSØGTE JOB</div>
                <span style={{fontSize:12,color:'var(--faint)'}}>{appliedJobs.length} job</span>
              </div>
              {appliedJobs.length===0
                ? <div style={{padding:'24px',textAlign:'center',color:'var(--faint)',fontSize:13}}>Ingen ansøgte job endnu — skriv en ansøgning og marker den som sendt</div>
                : appliedJobs.map((a,i)=>{
                  const si = APPLIED_STATUSES.find(s=>s.val===a.status)||APPLIED_STATUSES[0];
                  return (
                    <div key={a.id} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 20px',borderBottom:i<appliedJobs.length-1?'1px solid var(--border)':'none'}}>
                      <div style={{width:34,height:34,background:'var(--surface-high)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:13,color:'var(--muted)',flexShrink:0}}>{a.company[0]}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.title}</div>
                        <div style={{fontSize:12,color:'var(--muted)'}}>{a.company} · {a.date}</div>
                      </div>
                      <select value={a.status} onChange={e=>onApplyStatus(a.id,e.target.value)}
                        style={{padding:'4px 8px',border:`1px solid ${si.color}`,fontSize:11,color:si.color,background:'#fff',outline:'none',fontWeight:600,cursor:'pointer'}}>
                        {APPLIED_STATUSES.map(s=><option key={s.val} value={s.val}>{s.label}</option>)}
                      </select>
                    </div>
                  );
                })
              }
            </div>

          </div>

          {/* ── HØJRE SIDEBAR ───────────────────────────────────────────────── */}
          <div style={{display:'flex',flexDirection:'column',gap:14}}>

            {/* Præferencer */}
            <div style={{background:'#fff',padding:'18px 20px'}}>
              <div style={{fontSize:10,fontWeight:700,letterSpacing:'.1em',color:'var(--muted)',textTransform:'uppercase',marginBottom:14,fontFamily:'Manrope,sans-serif'}}>DINE PRÆFERENCER</div>
              {prefs ? <>
                <PrefRow label="Arbejdsform" icon={PREF_WORK_MODES.find(x=>x.val===prefs.workMode)?.icon} val={prefs.workMode}/>
                <PrefRow label="Brancher" val={prefs.industries?.length?prefs.industries.join(', '):'Alle'}/>
                <PrefRow label="Lønniveau" val={prefs.salary?`${prefs.salary} kr/md`:'Ikke angivet'}/>
                <PrefRow label="Søgestatus" val={PREF_STATUS.find(x=>x.val===prefs.status)?.label||prefs.status}/>
              </> : (
                <div style={{fontSize:13,color:'var(--faint)',lineHeight:1.6}}>Ingen præferencer sat endnu.</div>
              )}
            </div>

            {/* Top nøgleord */}
            {profile?.keywords?.length>0&&(
              <div style={{background:'#fff',padding:'18px 20px'}}>
                <div style={{fontSize:10,fontWeight:700,letterSpacing:'.1em',color:'var(--muted)',textTransform:'uppercase',marginBottom:12,fontFamily:'Manrope,sans-serif'}}>TOP NØGLEORD</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                  {profile.keywords.slice(0,16).map((k,i)=>(
                    <span key={k} style={{
                      fontSize:12,padding:'3px 8px',
                      background:i<6?'var(--navy)':i<12?'var(--accent-bg)':'var(--surface-high)',
                      color:i<6?'#fff':i<12?'var(--navy)':'var(--muted)',
                      fontWeight:i<6?600:400,
                    }}>{k}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Realistiske jobtyper */}
            {profile?.adjacent_roles?.length>0&&(
              <div style={{background:'#fff',padding:'18px 20px'}}>
                <div style={{fontSize:10,fontWeight:700,letterSpacing:'.1em',color:'var(--muted)',textTransform:'uppercase',marginBottom:12,fontFamily:'Manrope,sans-serif'}}>REALISTISKE JOBTYPER</div>
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  {profile.adjacent_roles.slice(0,6).map((r,i)=>(
                    <div key={r} style={{display:'flex',alignItems:'center',gap:8,fontSize:13,color:i<3?'var(--navy)':'var(--muted)',fontWeight:i<3?500:400}}>
                      <span style={{fontSize:10,color:'var(--faint)'}}>→</span>{r}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Wildcard roller */}
            {profile?.wildcard_roles?.length>0&&(
              <div style={{background:'#fff',padding:'18px 20px',borderLeft:'3px solid var(--amber)'}}>
                <div style={{fontSize:10,fontWeight:700,letterSpacing:'.1em',color:'var(--amber)',textTransform:'uppercase',marginBottom:10,fontFamily:'Manrope,sans-serif'}}>✦ OVERRASK DIG SELV</div>
                <div style={{fontSize:12,color:'var(--muted)',marginBottom:10,lineHeight:1.4}}>{profile.discovery_reasoning?.split('.')[0]||'Uventede roller der passer til din profil'}</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                  {profile.wildcard_roles.slice(0,5).map(r=>(
                    <span key={r} style={{fontSize:12,padding:'3px 9px',background:'#fffbf0',border:'1px solid rgba(180,130,30,0.25)',color:'#7b5e10',fontWeight:500}}>{r}</span>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════ JOBS SCREEN ════════════════════════════════════════ */
const JobsScreen = ({profile, prefs, jobs, jobsLoaded, jobsLoading, jobsTotal, onRefresh, onReupload, onLogout, user}) => {
  const [tab,setTab] = useState('jobs'); // 'jobs' | 'gemt' | 'profil'
  const [selected,setSelected] = useState(null);
  const [search,setSearch] = useState('');
  const [industryF,setIndustryF] = useState('Alle');
  const [modeF,setModeF] = useState('Alle');
  const [minScore,setMinScore] = useState(0);
  const [showDiscovery,setShowDiscovery] = useState(true);
  const [jobsDB,setJobsDB] = useState(jobs);
  const [realJobs,setRealJobs] = useState(!!jobsLoaded);
  const [refreshing,setRefreshing] = useState(false);

  // ── Semantiske embedding-scores {jobId: score} ───────────────────────────
  const [embeddingScores, setEmbeddingScores] = useState({});
  const embFetchedRef = useRef(false); // undgå dobbelt-kald

  // ── Adfærds-tracking: lær af hvad brugeren klikker/gemmer ───────────────
  const [behavior, setBehavior] = useState(()=>{
    try{ return JSON.parse(localStorage.getItem('jobr_behavior')||'{}'); }catch{ return {}; }
  });
  const trackBehavior = useCallback((job) => {
    setBehavior(prev => {
      const next = {
        ...prev,
        industries: {
          ...(prev.industries||{}),
          ...(job.industry ? {[job.industry]: ((prev.industries||{})[job.industry]||0)+1} : {}),
        },
        workModes: {
          ...(prev.workModes||{}),
          ...(job.workMode ? {[job.workMode]: ((prev.workModes||{})[job.workMode]||0)+1} : {}),
        },
      };
      try{ localStorage.setItem('jobr_behavior', JSON.stringify(next)); }catch{}
      return next;
    });
  }, []);

  // ── Hent embedding-scores når profil + jobs er klar ─────────────────────
  useEffect(()=>{
    if (!profile || !jobsDB.length || embFetchedRef.current) return;
    embFetchedRef.current = true;

    const cvText = [
      profile.roleFamily,
      profile.summary,
      profile.skills?.slice(0,25).map(s=>s.name).join(', '),
      profile.adjacent_roles?.join(', '),
      profile.keywords?.slice(0,10).join(', '),
    ].filter(Boolean).join('. ');

    const jobPayload = jobsDB.map(j=>({
      id: j.id,
      title: j.title,
      description: (j.description||'').slice(0, 500),
    }));

    fetch(`${API_BASE}/api/embed-match`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ cv_text: cvText, jobs: jobPayload }),
    })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(scores => {
        console.log('[Embed] ✅ Scores modtaget:', Object.keys(scores).length, 'jobs');
        setEmbeddingScores(scores);
      })
      .catch(e => console.warn('[Embed] Ikke tilgængelig:', e));
  }, [profile, jobsDB]);

  // Reset embedding fetch hvis jobs genindlæses
  useEffect(()=>{ embFetchedRef.current = false; }, [jobsDB]);

  // Saved + applied — persisteret i localStorage
  const [savedIds,setSavedIds] = useState(()=>{
    try{ return JSON.parse(localStorage.getItem('jobr_saved')||'[]'); }catch{ return []; }
  });
  const [appliedJobs,setAppliedJobs] = useState(()=>{
    try{ return JSON.parse(localStorage.getItem('jobr_applied')||'[]'); }catch{ return []; }
  });
  useEffect(()=>{ try{ localStorage.setItem('jobr_saved',JSON.stringify(savedIds)); }catch{} },[savedIds]);
  useEffect(()=>{ try{ localStorage.setItem('jobr_applied',JSON.stringify(appliedJobs)); }catch{} },[appliedJobs]);

  const toggleSave = id => setSavedIds(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]);

  const handleApply = job => setAppliedJobs(prev=>{
    if(prev.find(a=>a.id===job.id)) return prev;
    return [...prev,{id:job.id,title:job.title,company:job.company,
      date:new Date().toLocaleDateString('da-DK',{day:'numeric',month:'short'}),status:'ansøgt'}];
  });

  const updateApplyStatus = (id,status) =>
    setAppliedJobs(prev=>prev.map(a=>a.id===id?{...a,status}:a));

  const matches = useMemo(()=>{
    if(!profile) return {};
    const m={};
    jobsDB.forEach(j=>{
      m[j.id] = scoreJob(profile, j, prefs, embeddingScores[j.id] ?? null, behavior);
    });
    return m;
  },[profile, jobsDB, prefs, embeddingScores, behavior]);

  // Discovery: jobs der matcher wildcard_roles men ikke er i top-matches
  const discoveredJobs = useMemo(()=>{
    if(!profile?.wildcard_roles?.length) return [];
    const topIds = new Set(
      Object.entries(matches)
        .filter(([,m])=>m&&m.total>=55)
        .map(([id])=>id)
    );
    const results = [];
    jobsDB.forEach(j=>{
      if(topIds.has(j.id)) return; // Allerede i normale match
      const d = discoveryScore(profile, j);
      if(d && d.score >= 40) results.push({...j, _discovery: d});
    });
    results.sort((a,b)=>b._discovery.score - a._discovery.score);
    return results.slice(0,5);
  },[profile,jobsDB,matches]);

  const filtered = useMemo(()=>{
    const q=search.toLowerCase();
    let list = tab==='gemt' ? jobsDB.filter(j=>savedIds.includes(j.id)) : jobsDB;
    return list.filter(j=>{
      if(q&&!j.title.toLowerCase().includes(q)&&!j.company.toLowerCase().includes(q)&&!j.location.toLowerCase().includes(q)) return false;
      if(industryF!=='Alle'&&j.industry!==industryF) return false;
      if(modeF!=='Alle'&&j.workMode!==modeF) return false;
      const m=matches[j.id];
      if(m&&m.total<minScore) return false;
      return true;
    }).sort((a,b)=>{
      const ma=matches[a.id],mb=matches[b.id];
      if(ma&&mb) return mb.total-ma.total;
      return 0;
    });
  },[jobsDB,search,industryF,modeF,minScore,matches,tab,savedIds]);

  useEffect(()=>{ setJobsDB(jobs); setRealJobs(!!jobsLoaded); },[jobs,jobsLoaded]);

  const handleRefresh = async () => {
    if(!onRefresh||refreshing) return;
    setRefreshing(true); await onRefresh(); setRefreshing(false);
  };

  const switchTab = t => { setTab(t); setSelected(null); };
  const isApplied = id => !!appliedJobs.find(a=>a.id===id);

  const industries=['Alle',...new Set(jobsDB.map(j=>j.industry).filter(Boolean))];
  const modes=['Alle','Remote','Hybrid','Kontor'];

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100vh',overflow:'hidden'}}>
      {/* Nav */}
      <div style={{height:52,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',padding:'0 16px',gap:10,background:'var(--surface)',flexShrink:0}}>
        <Logo/>
        <div style={{flex:1,display:'flex',gap:4,marginLeft:6}}>
          <NavTab active={tab==='jobs'}   label="Jobs"  onClick={()=>switchTab('jobs')}/>
          <NavTab active={tab==='gemt'}   label="Gemt"  badge={savedIds.length} onClick={()=>switchTab('gemt')}/>
          <NavTab active={tab==='profil'} label="Profil" onClick={()=>switchTab('profil')}/>
        </div>
        <div style={{display:'flex',gap:7}}>
          {profile&&tab!=='profil'&&(
            <div style={{display:'flex',alignItems:'center',gap:5,padding:'4px 9px',background:'var(--green-bg)',border:'1px solid var(--green-bd)'}}>
              <Ic n="check" s={11}/>
              <span style={{fontSize:12,color:'var(--green)',fontWeight:500}}>{profile.totalSkills} kompetencer</span>
            </div>
          )}
          <button onClick={onReupload} style={{fontSize:13,color:'var(--muted)',padding:'5px 10px',border:'1px solid var(--border2)',display:'flex',alignItems:'center',gap:4}}>
            <Ic n="upload" s={12}/>Skift CV
          </button>
          {user && onLogout && (
            <button onClick={onLogout} title={user.email} style={{fontSize:12,color:'var(--faint)',padding:'5px 10px',border:'1px solid var(--border2)',display:'flex',alignItems:'center',gap:4}}>
              <Ic n="user" s={12}/> Log ud
            </button>
          )}
        </div>
      </div>

      {/* Profil-tab */}
      {tab==='profil'&&(
        <ProfileDashboard profile={profile} prefs={prefs}
          savedIds={savedIds} appliedJobs={appliedJobs}
          jobsDB={jobsDB} matches={matches}
          onSelectJob={j=>{ switchTab('jobs'); setSelected(j); }}
          onApplyStatus={updateApplyStatus}
          onReupload={onReupload}
          user={user}/>
      )}

      {/* Jobs / Gemt tabs */}
      {tab!=='profil'&&(
        <div style={{flex:1,display:'flex',overflow:'hidden'}}>
          {/* Left */}
          <div style={{width:selected?'42%':'100%',display:'flex',flexDirection:'column',borderRight:selected?'1px solid var(--border)':'none',overflow:'hidden',transition:'width .2s'}}>
            {/* Filters */}
            <div style={{padding:'10px 12px',borderBottom:'1px solid var(--border)',background:'var(--surface)',flexShrink:0,display:'flex',flexDirection:'column',gap:7}}>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Søg på titel, virksomhed..."
                style={{width:'100%',padding:'7px 0',border:'none',borderBottom:'1px solid var(--border2)',fontSize:13,outline:'none',background:'transparent'}}
                onFocus={e=>e.target.style.borderColor='var(--navy)'}
                onBlur={e=>e.target.style.borderColor='var(--border)'}/>
              <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
                <select value={industryF} onChange={e=>setIndustryF(e.target.value)}
                  style={{padding:'4px 0',border:'none',borderBottom:'1px solid var(--border2)',fontSize:12,background:'transparent',outline:'none',color:'var(--text)'}}>
                  {industries.map(i=><option key={i}>{i}</option>)}
                </select>
                <select value={modeF} onChange={e=>setModeF(e.target.value)}
                  style={{padding:'4px 0',border:'none',borderBottom:'1px solid var(--border2)',fontSize:12,background:'transparent',outline:'none',color:'var(--text)'}}>
                  {modes.map(m=><option key={m}>{m}</option>)}
                </select>
                {profile&&(
                  <div style={{display:'flex',alignItems:'center',gap:5,marginLeft:'auto'}}>
                    <span style={{fontSize:11,color:'var(--faint)'}}>Min. score</span>
                    <input type="range" min={0} max={90} step={10} value={minScore} onChange={e=>setMinScore(+e.target.value)}
                      style={{width:65,accentColor:'var(--navy)'}}/>
                    <span style={{fontSize:12,fontWeight:500,color:'var(--navy)',width:28}}>{minScore}%</span>
                  </div>
                )}
              </div>
            </div>

            {/* Count bar */}
            <div style={{padding:'6px 14px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between',background:'var(--surface)',flexShrink:0}}>
              <span style={{fontSize:12,color:'var(--muted)'}}>
                {jobsLoading && jobsDB.length === 0
                  ? <span style={{color:'var(--faint)'}}>Henter job…</span>
                  : <><strong style={{color:'var(--text)'}}>{filtered.length}</strong> job
                    {jobsLoaded && <span style={{color:'var(--green)'}}> · live</span>}
                    {profile && <span style={{color:'var(--green)'}}> · sorteret efter match</span>}
                  </>
                }
              </span>
              <button onClick={handleRefresh} disabled={refreshing}
                style={{fontSize:11,color:'var(--navy)',display:'flex',alignItems:'center',gap:3,padding:'2px 7px',border:'none',background:'var(--accent-bg)',opacity:refreshing?.6:1}}>
                <span className={refreshing?'spin':''}><Ic n="refresh" s={11}/></span>
                {refreshing?'Henter...':'Opdater'}
              </button>
            </div>

            {/* Job list */}
            <div style={{flex:1,overflowY:'auto'}}>
              {/* Loading state — ingen jobs hentet endnu */}
              {jobsLoading && jobsDB.length === 0
                ? <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',gap:14,color:'var(--muted)',padding:32}}>
                    <span className="spin" style={{color:'var(--navy)'}}><Ic n="loader" s={28}/></span>
                    <div style={{fontSize:13,textAlign:'center'}}>
                      <div style={{fontWeight:500,marginBottom:4}}>Henter job...</div>
                      <div style={{fontSize:12,color:'var(--faint)'}}>Søger blandt tusindvis af danske stillinger</div>
                    </div>
                  </div>
                : filtered.length===0
                  ? <div style={{padding:32,textAlign:'center',color:'var(--muted)',fontSize:13}}>
                      {tab==='gemt'?'Ingen gemte job endnu.':'Ingen job matcher filtrene.'}
                    </div>
                  : filtered.map(j=>(
                    <JobRow key={j.id} job={j} match={matches[j.id]}
                      selected={selected?.id===j.id}
                      onSelect={()=>{ setSelected(j); trackBehavior(j); }}
                      saved={savedIds.includes(j.id)} applied={isApplied(j.id)}
                      onSave={toggleSave}/>
                  ))
              }

              {/* Opdagede muligheder */}
              {tab==='jobs' && !search && discoveredJobs.length > 0 && (
                <div style={{padding:'0 0 24px'}}>
                  <button onClick={()=>setShowDiscovery(s=>!s)}
                    style={{width:'100%',padding:'12px 14px',display:'flex',alignItems:'center',gap:8,background:'var(--amber-bg)',borderTop:'1px solid var(--amber-bd)',borderBottom:showDiscovery?'none':'1px solid var(--border)',cursor:'pointer'}}>
                    <span style={{fontSize:16}}>🔭</span>
                    <div style={{flex:1,textAlign:'left'}}>
                      <div style={{fontSize:12,fontWeight:700,color:'var(--amber)',letterSpacing:'.04em',textTransform:'uppercase',fontFamily:'Manrope,sans-serif'}}>Opdagede muligheder</div>
                      <div style={{fontSize:11,color:'var(--muted)',marginTop:1}}>Jobs du måske ikke selv har overvejet — baseret på dine skjulte styrker</div>
                    </div>
                    <span style={{fontSize:11,color:'var(--faint)',transform:showDiscovery?'rotate(0)':'rotate(-90deg)',transition:'transform .2s'}}>▼</span>
                  </button>

                  {showDiscovery && (
                    <div>
                      {profile?.discovery_reasoning && (
                        <div style={{padding:'10px 14px',background:'var(--amber-bg)',borderBottom:'1px solid var(--amber-bd)',fontSize:12,color:'var(--amber)',lineHeight:1.5,display:'flex',gap:8}}>
                          <span style={{flexShrink:0,marginTop:1}}>💡</span>
                          <span>{profile.discovery_reasoning}</span>
                        </div>
                      )}
                      {discoveredJobs.map(j=>(
                        <div key={j.id} style={{borderBottom:'1px solid var(--border)',position:'relative'}}>
                          <div style={{position:'absolute',top:10,left:0,width:3,height:'calc(100% - 20px)',background:'var(--amber)',opacity:.6}}/>
                          <JobRow job={j} match={{total:j._discovery.score, reasons:[`Wildcard match: ${j._discovery.matchedRole}`]}}
                            selected={selected?.id===j.id}
                            onSelect={()=>{ setSelected(j); trackBehavior(j); }}
                            saved={savedIds.includes(j.id)} applied={isApplied(j.id)}
                            onSave={toggleSave}
                            discoveryLabel={j._discovery.matchedRole}/>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right: detail */}
          {selected&&(
            <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}} className="fade">
              <div style={{padding:'8px 14px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:8,background:'var(--surface)',flexShrink:0}}>
                <button onClick={()=>setSelected(null)} style={{display:'flex',alignItems:'center',gap:4,fontSize:12,color:'var(--muted)',padding:'3px 7px',border:'1px solid var(--border2)'}}>
                  <Ic n="back" s={13}/>Luk
                </button>
                <span style={{fontSize:12,color:'var(--faint)',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{selected.title} · {selected.company}</span>
              </div>
              <div style={{flex:1,overflow:'hidden'}}>
                <JobDetail job={selected} match={matches[selected.id]}
                  saved={savedIds.includes(selected.id)} applied={isApplied(selected.id)}
                  onSave={toggleSave} onApply={handleApply} profile={profile}/>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
const NavTab=({label,active,onClick,badge})=>(
  <button onClick={onClick} style={{padding:'5px 9px',fontSize:13,fontWeight:active?500:400,color:active?'var(--navy)':'var(--muted)',background:active?'var(--surface-low)':'transparent',display:'flex',alignItems:'center',gap:4}}>
    {label}
    {badge>0&&<span style={{background:'var(--navy)',color:'#fff',fontSize:10,padding:'0 5px',lineHeight:'16px'}}>{badge}</span>}
  </button>
);

/* ═══════════════════════ LANDING ════════════════════════════════════════════ */
const Landing = ({onUpload, onSkip}) => {
  const [drag,setDrag]=useState(false);
  const fileRef=useRef();
  return (
    <div style={{minHeight:'100vh',background:'var(--bg)',display:'flex',flexDirection:'column'}}>
      {/* Nav – glassmorphism */}
      <div style={{padding:'16px 32px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between',background:'rgba(251,249,244,0.85)',backdropFilter:'blur(12px)',position:'sticky',top:0,zIndex:10}}>
        <Logo/>
        <button onClick={onSkip} style={{fontSize:12,color:'var(--muted)',fontFamily:'Manrope,sans-serif',letterSpacing:'.03em',textDecoration:'underline',background:'none',border:'none',cursor:'pointer'}}>Se jobs uden CV →</button>
      </div>
      <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:'60px 24px'}}>
        <div style={{maxWidth:580,width:'100%',textAlign:'center'}}>
          {/* Display headline – Newsreader */}
          <div style={{fontSize:11,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--tan)',marginBottom:20,fontFamily:'Manrope,sans-serif'}}>Jobsøgning · Redesignet</div>
          <h1 style={{fontSize:48,fontWeight:400,letterSpacing:'-.02em',lineHeight:1.1,marginBottom:20,fontFamily:'Newsreader,Georgia,serif'}}>
            Upload dit CV.<br/><em>Vi finder jobbet.</em>
          </h1>
          <p style={{fontSize:16,color:'var(--muted)',lineHeight:1.7,marginBottom:48,maxWidth:420,margin:'0 auto 48px',fontFamily:'Manrope,sans-serif'}}>
            Jobr analyserer dine kompetencer, bygger din profil og matcher dig med jobs – præcist, automatisk, øjeblikkeligt.
          </p>
          {/* Drop zone – no rounded corners */}
          <div
            onDragOver={e=>{e.preventDefault();setDrag(true)}}
            onDragLeave={()=>setDrag(false)}
            onDrop={e=>{e.preventDefault();setDrag(false);onUpload(e.dataTransfer.files[0])}}
            onClick={()=>fileRef.current.click()}
            style={{border:`1.5px dashed ${drag?'var(--navy)':'var(--border2)'}`,padding:'52px 32px',cursor:'pointer',transition:'all .14s',background:drag?'var(--accent-bg)':'var(--surface-low)',maxWidth:440,margin:'0 auto'}}>
            <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt" style={{display:'none'}}
              onChange={e=>e.target.files[0]&&onUpload(e.target.files[0])}/>
            <div style={{display:'flex',justifyContent:'center',color:drag?'var(--navy)':'var(--muted)',marginBottom:16}}>
              <Ic n="upload" s={38}/>
            </div>
            <div style={{fontWeight:700,fontSize:15,marginBottom:6,fontFamily:'Manrope,sans-serif'}}>Træk dit CV hertil</div>
            <div style={{color:'var(--muted)',fontSize:13,fontFamily:'Manrope,sans-serif'}}>eller klik for at vælge fil</div>
            <div style={{marginTop:20,fontSize:11,color:'var(--faint)',letterSpacing:'.04em',fontFamily:'Manrope,sans-serif',textTransform:'uppercase'}}>PDF · DOCX · TXT · Kun lokalt i din browser</div>
          </div>
          <div style={{marginTop:28,display:'flex',justifyContent:'center',gap:28,fontSize:12,color:'var(--muted)',fontFamily:'Manrope,sans-serif',flexWrap:'wrap'}}>
            {['Automatisk profil-udtræk','Kompetence-matching','AI-ansøgning på sekunder'].map(f=>(
              <span key={f} style={{display:'flex',alignItems:'center',gap:5}}><Ic n="check" s={12}/>{f}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════ SHARED ═════════════════════════════════════════════ */
const Logo = () => (
  <div style={{display:'flex',alignItems:'center',gap:8}}>
    <div style={{width:26,height:26,background:'var(--navy)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
      <span style={{color:'#fff',fontWeight:800,fontSize:14,lineHeight:1,fontFamily:'Newsreader,Georgia,serif',fontStyle:'italic'}}>J</span>
    </div>
    <span style={{fontWeight:700,fontSize:16,letterSpacing:-.3,fontFamily:'Newsreader,Georgia,serif'}}>Jobr<span style={{color:'var(--tan)'}}>.</span></span>
  </div>
);

/* ═══════════════════════ LOGIN SCREEN ══════════════════════════════════════ */
const LoginScreen = ({onLogin}) => {
  const [mode,setMode]         = useState('login');
  const [email,setEmail]       = useState('');
  const [password,setPassword] = useState('');
  const [loading,setLoading]   = useState(false);
  const [error,setError]       = useState('');
  const [message,setMessage]   = useState('');
  const [rememberMe,setRememberMe] = useState(false);

  const submit = async e => {
    e.preventDefault(); setLoading(true); setError('');
    try {
      if (!_sb) throw new Error('Supabase ikke konfigureret – udfyld SUPABASE_URL og SUPABASE_ANON_KEY i index.html');
      if (mode === 'signup') {
        const {error:err} = await _sb.auth.signUp({email,password});
        if (err) throw err;
        setMessage('Tjek din email for bekræftelseslink ✉️');
      } else {
        const {data,error:err} = await _sb.auth.signInWithPassword({email,password});
        if (err) throw err;
        if (rememberMe) enablePersistentLogin();
        else disablePersistentLogin();
        onLogin(data.user);
      }
    } catch(e) { setError(e.message); }
    setLoading(false);
  };

  const loginLinkedIn = async () => {
    if (!_sb) { setError('Supabase ikke konfigureret'); return; }
    await _sb.auth.signInWithOAuth({
      provider:'linkedin_oidc',
      options:{redirectTo: window.location.origin}
    });
  };

  return (
    <div style={{minHeight:'100vh',display:'flex',flexDirection:'column',background:'var(--bg)'}}>
      <div style={{padding:'16px 24px',borderBottom:'1px solid var(--border)'}}><Logo/></div>
      <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
        <div style={{width:'100%',maxWidth:400}} className="fade">
          <h1 style={{fontSize:28,fontWeight:400,fontFamily:'Newsreader,Georgia,serif',marginBottom:6}}>
            {mode==='login'?'Log ind på Jobr':'Opret konto'}
          </h1>
          <p style={{color:'var(--muted)',fontSize:14,marginBottom:28}}>
            {mode==='login'?'Velkommen tilbage':'Find dit første job efter studiet'}
          </p>

          {/* LinkedIn */}
          <button onClick={loginLinkedIn} style={{
            width:'100%',padding:'11px 16px',border:'1px solid var(--border2)',
            background:'var(--surface-low)',display:'flex',alignItems:'center',
            justifyContent:'center',gap:9,fontSize:14,fontWeight:500,marginBottom:20,cursor:'pointer'
          }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="#0A66C2">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
            Fortsæt med LinkedIn
          </button>

          <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
            <div style={{flex:1,height:1,background:'var(--border)'}}/>
            <span style={{fontSize:12,color:'var(--faint)'}}>eller med email</span>
            <div style={{flex:1,height:1,background:'var(--border)'}}/>
          </div>

          <form onSubmit={submit}>
            <div style={{marginBottom:13}}>
              <div style={{fontSize:11,fontWeight:700,letterSpacing:'.05em',color:'var(--muted)',marginBottom:5,textTransform:'uppercase'}}>Email</div>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required
                style={{width:'100%',padding:'10px 12px',border:'1px solid var(--border2)',background:'var(--surface-low)',fontSize:14,outline:'none',boxSizing:'border-box'}}
                placeholder="dig@email.dk"/>
            </div>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:11,fontWeight:700,letterSpacing:'.05em',color:'var(--muted)',marginBottom:5,textTransform:'uppercase'}}>Adgangskode</div>
              <input type="password" value={password} onChange={e=>setPassword(e.target.value)} required
                style={{width:'100%',padding:'10px 12px',border:'1px solid var(--border2)',background:'var(--surface-low)',fontSize:14,outline:'none',boxSizing:'border-box'}}
                placeholder="••••••••"/>
            </div>
            {mode === 'login' && (
              <label style={{display:'flex',alignItems:'center',gap:8,marginBottom:18,cursor:'pointer',userSelect:'none'}}>
                <input type="checkbox" checked={rememberMe} onChange={e=>setRememberMe(e.target.checked)}
                  style={{width:15,height:15,accentColor:'var(--navy)',cursor:'pointer'}}/>
                <span style={{fontSize:13,color:'var(--muted)'}}>Forbliv logget ind</span>
              </label>
            )}
            {error   && <div style={{color:'var(--red)',fontSize:13,marginBottom:12,padding:'8px 12px',background:'#fff5f5'}}>{error}</div>}
            {message && <div style={{color:'var(--green)',fontSize:13,marginBottom:12,padding:'8px 12px',background:'var(--green-bg)'}}>{message}</div>}
            <button type="submit" disabled={loading} style={{
              width:'100%',padding:'12px',background:'var(--navy)',
              color:'#fff',fontSize:14,fontWeight:600,letterSpacing:'.05em',border:'none',cursor:loading?'default':'pointer',
              opacity:loading?.7:1
            }}>
              {loading ? '...' : mode==='login' ? 'Log ind' : 'Opret konto'}
            </button>
          </form>

          <div style={{marginTop:16,textAlign:'center',fontSize:13,color:'var(--muted)'}}>
            {mode==='login' ? 'Ny bruger? ' : 'Har du allerede en konto? '}
            <button onClick={()=>{setMode(m=>m==='login'?'signup':'login');setError('');setMessage('');}}
              style={{color:'var(--navy)',fontWeight:600,textDecoration:'underline',background:'none',border:'none',cursor:'pointer',fontSize:13}}>
              {mode==='login' ? 'Opret konto' : 'Log ind'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════ APP ════════════════════════════════════════════════ */
const LS_PROFILE = 'jobr_profile_v2';
const LS_PREFS   = 'jobr_prefs_v1';

const App = () => {
  const [screen,setScreen]         = useState('landing');
  const [pendingFile,setPendingFile]= useState(null);
  const [profile,setProfile]       = useState(null);
  const [prefs,setPrefs]           = useState(null);
  const [jobsData,setJobsData]     = useState([]);
  const [jobsLoaded,setJobsLoaded] = useState(false);
  const [jobsTotal,setJobsTotal]   = useState(0);
  const [jobsLoading,setJobsLoading]= useState(false);

  // ── Auth state ──────────────────────────────────────────────────
  const [user,setUser]           = useState(null);
  const [authReady,setAuthReady] = useState(false);   // venter på Supabase session-check

  useEffect(()=>{
    if (!_sb) { setAuthReady(true); return; }           // Supabase ikke konfigureret → spring over
    _sb.auth.getSession().then(({data:{session}})=>{
      setUser(session?.user ?? null);
      setAuthReady(true);
    });
    const {data:{subscription}} = _sb.auth.onAuthStateChange((_,session)=>{
      setUser(session?.user ?? null);
    });
    return ()=>subscription.unsubscribe();
  },[]);

  // ── Indlæs profil (Supabase → localStorage fallback) ───────────
  useEffect(()=>{
    if (!authReady) return;
    const loadProfile = async () => {
      // 1. Prøv Supabase
      if (_sb && user) {
        try {
          const {data} = await _sb.from('profiles').select('*').eq('id',user.id).single();
          if (data?.skills_json) {
            const p = {
              roleFamily:data.role_family, seniority:data.seniority,
              years:data.years_experience, education:data.education,
              languages:data.languages||[], keywords:data.keywords||[],
              skills:JSON.parse(data.skills_json||'[]'),
              strengths:data.strengths||[], fileName:data.cv_filename||'',
              aiAnalyzed:data.ai_analyzed, aiModel:data.ai_model,
              totalSkills:JSON.parse(data.skills_json||'[]').length,
              explicitCount:0, inferredCount:0,
            };
            p.skillsByCategory={};
            p.skills.forEach(s=>{if(!p.skillsByCategory[s.cat])p.skillsByCategory[s.cat]=[];p.skillsByCategory[s.cat].push(s);});
            p.explicitCount=p.skills.filter(s=>!s.inferred).length;
            p.inferredCount=p.skills.filter(s=>s.inferred).length;
            setProfile(p);
            if (data.pref_work_mode) setPrefs({workMode:data.pref_work_mode,industries:data.pref_industries||[],salaryMin:data.pref_salary_min,searchStatus:data.pref_search_status});
            setScreen('jobs'); return;
          }
        } catch(e) {}
      }
      // 2. Fallback: localStorage
      try {
        const sp = localStorage.getItem(LS_PROFILE);
        const spf = localStorage.getItem(LS_PREFS);
        if (sp) { setProfile(JSON.parse(sp)); if(spf) setPrefs(JSON.parse(spf)); setScreen('jobs'); }
      } catch(e) {}
    };
    loadProfile();
  },[authReady, user]);

  // Hent jobs parallelt — alle sider på én gang så brugeren ikke venter
  const loadJobs = useCallback(async (reset=false) => {
    setJobsLoading(true);
    try {
      const pages = 3; // 3 parallelle kald = ~60-90 jobs
      const offsets = Array.from({length: pages}, (_, i) => i * 20);
      const results = await Promise.allSettled(
        offsets.map(offset => fetchJobnetBrowser(offset))
      );
      const all = results
        .filter(r => r.status === 'fulfilled' && r.value?.jobs?.length)
        .flatMap(r => r.value.jobs);
      const total = results.find(r => r.status === 'fulfilled')?.value?.total || all.length;

      if (all.length > 0) {
        // Dedupliker på id
        const seen = new Set();
        const unique = all.filter(j => { if (seen.has(j.id)) return false; seen.add(j.id); return true; });
        setJobsData(unique);
        setJobsLoaded(true);
        setJobsTotal(total);
      }
    } catch(e) {
      console.warn('Jobs fetch fejl:', e.message);
    }
    setJobsLoading(false);
  }, []);

  useEffect(()=>{ loadJobs(true); },[]);

  const handleFileFromLanding = file => { setPendingFile(file); setScreen('upload'); };

  const handleProfile = async p => {
    setProfile(p);
    // Gem lokalt
    try { localStorage.setItem(LS_PROFILE, JSON.stringify({
      roleFamily:p.roleFamily, seniority:p.seniority, years:p.years,
      education:p.education, languages:p.languages, keywords:p.keywords,
      skills:p.skills, skillsByCategory:p.skillsByCategory,
      roles:p.roles, strengths:p.strengths, totalSkills:p.totalSkills, fileName:p.fileName,
      aiAnalyzed:p.aiAnalyzed, aiModel:p.aiModel, explicitCount:p.explicitCount, inferredCount:p.inferredCount,
    })); } catch(e) {}
    // Gem i Supabase
    if (_sb && user) {
      try { await _sb.from('profiles').upsert({
        id: user.id,
        cv_filename: p.fileName, role_family: p.roleFamily,
        seniority: p.seniority, years_experience: p.years,
        education: p.education, languages: p.languages||[],
        skills_json: JSON.stringify(p.skills||[]),
        keywords: p.keywords||[], strengths: p.strengths||[],
        ai_analyzed: p.aiAnalyzed||false, ai_model: p.aiModel||null,
        updated_at: new Date().toISOString(),
      }); } catch(e) { console.warn('Supabase profil-gem fejl:', e.message); }
    }
    setScreen('prefs');
  };

  const handlePrefs = async p => {
    setPrefs(p);
    try { localStorage.setItem(LS_PREFS, JSON.stringify(p)); } catch(e) {}
    if (_sb && user) {
      try { await _sb.from('profiles').upsert({
        id: user.id,
        pref_work_mode: p.workMode||null,
        pref_industries: p.industries||[],
        pref_salary_min: p.salaryMin||null,
        pref_search_status: p.searchStatus||null,
        updated_at: new Date().toISOString(),
      }); } catch(e) {}
    }
    setScreen('jobs');
  };

  const handleReupload = () => {
    setProfile(null); setPrefs(null);
    try { localStorage.removeItem(LS_PROFILE); localStorage.removeItem(LS_PREFS); } catch(e) {}
    setScreen('upload');
  };

  const handleLogout = async () => {
    if (_sb) await _sb.auth.signOut();
    setUser(null); setProfile(null); setPrefs(null);
    try { localStorage.removeItem(LS_PROFILE); localStorage.removeItem(LS_PREFS); } catch(e) {}
    setScreen('landing');
  };

  const refreshJobs = () => {
    fetch(`${API_BASE}/api/refresh`).catch(()=>{});
    loadJobs(true);
  };

  // Vent på Supabase session-check
  if (!authReady) return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg)'}}>
      <span className="spin" style={{color:'var(--navy)'}}><Ic n="loader" s={28}/></span>
    </div>
  );

  // Kræv login hvis Supabase er konfigureret
  const supabaseConfigured = SUPABASE_URL !== 'https://DIN-PROJEKT-ID.supabase.co';
  if (supabaseConfigured && !user) return <LoginScreen onLogin={setUser}/>;

  if (screen==='landing') return <Landing onUpload={handleFileFromLanding} onSkip={()=>setScreen('jobs')}/>;
  if (screen==='upload')  return <UploadScreen initialFile={pendingFile} onProfile={handleProfile}/>;
  if (screen==='prefs')   return <PreferencesScreen profile={profile} onDone={handlePrefs} onReupload={handleReupload}/>;
  if (screen==='profile') return <ProfileScreen profile={profile} jobs={jobsData} onContinue={()=>setScreen('jobs')} onReupload={handleReupload} onUpdateProfile={setProfile} user={user}/>;
  return <JobsScreen profile={profile} prefs={prefs} jobs={jobsData} jobsLoaded={jobsLoaded} jobsLoading={jobsLoading} jobsTotal={jobsTotal} onRefresh={refreshJobs} onReupload={handleReupload} onLogout={handleLogout} user={user}/>;
};

/* ═══════════════════════ UPLOAD / PARSE SCREEN ═════════════════════════════ */
const UploadScreen = ({onProfile, initialFile}) => {
  const [state,setState]=useState(initialFile?'parsing':'idle');
  const [progress,setProgress]=useState([]);
  const [drag,setDrag]=useState(false);
  const [aiStatus,setAiStatus]=useState(null); // null | {ok,ai_available,ai_type,ai_error}
  const fileRef=useRef();
  const started=useRef(false);

  // Ping Railway /api/status ved mount
  useEffect(()=>{
    if(API_BASE) {
      fetch(`${API_BASE}/api/status`,{signal:AbortSignal.timeout(8000)})
        .then(r=>r.json())
        .then(d=>setAiStatus(d))
        .catch(()=>setAiStatus({ok:false,ai_available:false,ai_error:'Railway ikke tilgængelig'}));
    }
  },[]);

  const delay=ms=>new Promise(r=>setTimeout(r,ms));
  const steps=["Læser fil...","Sender til AI-analyse...","Udtrækker kompetencer...","Analyserer karriereniveau...","Bygger profil..."];

  const run=useCallback(async file=>{
    setState('parsing');setProgress([]);
    try{
      setProgress([steps[0]]);
      const raw=await parseFileText(file);
      setProgress(p=>[...p,steps[1]]);
      const profile=await analyzeCV(raw, file.name, (msg)=>{
        setProgress(p=>[...p, msg]);
      });
      setProgress(p=>[...p,steps[4]]);
      await delay(300);
      onProfile(profile);
    }catch(e){console.error(e);setState('error');}
  },[onProfile]);

  useEffect(()=>{
    if(initialFile&&!started.current){started.current=true;run(initialFile);}
  },[initialFile,run]);

  return(
    <div style={{minHeight:'100vh',display:'flex',flexDirection:'column',background:'var(--surface)'}}>
      <div style={{padding:'16px 24px',borderBottom:'1px solid var(--border)'}}><Logo/></div>
      <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
        <div style={{width:'100%',maxWidth:480,textAlign:'center'}}>
          {state==='idle'&&(
            <>
              <h1 style={{fontSize:26,fontWeight:700,marginBottom:10}}>Upload dit CV</h1>
              <p style={{color:'var(--muted)',fontSize:14,marginBottom:16}}>PDF, DOCX eller TXT – analyseres direkte i browseren</p>
              {/* AI status badge */}
              {API_BASE && aiStatus !== null && (
                <div style={{display:'inline-flex',alignItems:'center',gap:7,fontSize:12,padding:'5px 12px',marginBottom:20,
                  background: aiStatus?.ai_available ? 'var(--green-bg)' : 'var(--surface-high)',
                  border: `1px solid ${aiStatus?.ai_available ? 'var(--green-bd)' : 'var(--border2)'}`,
                  color: aiStatus?.ai_available ? 'var(--green)' : 'var(--muted)',
                }}>
                  <span style={{width:6,height:6,borderRadius:'50%',background: aiStatus?.ai_available ? 'var(--green)' : 'var(--faint)',flexShrink:0}}/>
                  {aiStatus?.ai_available
                    ? `AI-analyse aktiv (${aiStatus.ai_type === 'openai' ? 'GPT-4o mini' : 'Claude Haiku'})`
                    : aiStatus?.ok === false
                      ? 'Railway ikke tilgængelig – bruger regelbaseret analyse'
                      : `AI ikke aktiv: ${aiStatus?.ai_error || 'ingen API-nøgle'}`
                  }
                </div>
              )}
              <div onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)}
                onDrop={e=>{e.preventDefault();setDrag(false);run(e.dataTransfer.files[0])}}
                onClick={()=>fileRef.current.click()}
                style={{border:`1.5px dashed ${drag?'var(--navy)':'var(--border2)'}`,padding:'44px 24px',cursor:'pointer',background:drag?'var(--accent-bg)':'var(--bg)'}}>
                <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt" style={{display:'none'}} onChange={e=>e.target.files[0]&&run(e.target.files[0])}/>
                <div style={{display:'flex',justifyContent:'center',color:'var(--faint)',marginBottom:10}}><Ic n="upload" s={28}/></div>
                <div style={{fontWeight:500}}>Klik eller træk fil hertil</div>
              </div>
            </>
          )}
          {state==='parsing'&&(
            <div className="fade">
              <div style={{display:'flex',justifyContent:'center',color:'var(--navy)',marginBottom:20}}>
                <span className="spin"><Ic n="loader" s={32}/></span>
              </div>
              <h2 style={{fontSize:18,fontWeight:600,marginBottom:22}}>Analyserer CV</h2>
              <div style={{display:'flex',flexDirection:'column',gap:8,textAlign:'left',maxWidth:280,margin:'0 auto'}}>
                {steps.map((step,i)=>{
                  const done=progress.length>i, active=progress.length===i;
                  return(
                    <div key={i} style={{display:'flex',alignItems:'center',gap:9}}>
                      <div style={{width:18,height:18,border:`1.5px solid ${done?'var(--green)':active?'var(--navy)':'var(--border2)'}`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,background:done?'var(--green-bg)':'transparent',transition:'all .3s'}}>
                        {done?<Ic n="check" s={10}/>:active?<span className="spin" style={{color:'var(--navy)'}}><Ic n="loader" s={9}/></span>:null}
                      </div>
                      <span style={{fontSize:13,color:done?'var(--text)':active?'var(--navy)':'var(--faint)',fontWeight:done||active?500:400,transition:'color .3s'}}>{step}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {state==='error'&&(
            <div className="fade">
              <div style={{fontSize:28,marginBottom:10}}>⚠️</div>
              <h2 style={{fontWeight:600,marginBottom:8}}>Kunne ikke parse fil</h2>
              <p style={{color:'var(--muted)',fontSize:13,marginBottom:16}}>Prøv et andet format eller brug en kopi af CV-teksten.</p>
              <button onClick={()=>setState('idle')} style={{padding:'8px 18px',background:'var(--navy)',color:'#fff',fontWeight:500}}>Prøv igen</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


export default App
