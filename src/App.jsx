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

// Supabase klient
const _sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
  "Forretning":   ["forretningsudvikling","projektledelse","budgettering","finansiel analyse","excel","powerpoint","sql","strategi","konsulentvirksomhed","change management","b2b","saas"],
  "Bløde":        ["kommunikation","ledelse","teamledelse","præsentation","forhandling","samarbejde","problemløsning","analytisk","selvstændig","kreativ"],
};
// Flat list with category attached
const ALL_SKILLS = Object.entries(SKILL_GROUPS).flatMap(([cat,skills]) =>
  skills.map(s => ({ name:s, cat }))
);

/* ═══════════════════════ CV ANALYSIS ENGINE ════════════════════════════════ */
const norm = t => (t||"").toLowerCase().replace(/[^\w\sæøå]/g," ").replace(/\s+/g," ").trim();

function extractSkillsFromText(text) {
  const t = norm(text);
  const found = {};
  ALL_SKILLS.forEach(({name,cat}) => {
    const aliases = name === "c#" ? ["c#","csharp","c sharp"] :
                    name === "node.js" ? ["node.js","nodejs","node js"] :
                    name === "next.js" ? ["next.js","nextjs","next js"] :
                    name === "nest.js" ? ["nest.js","nestjs"] :
                    name === "vue"     ? ["vue","vuejs","vue.js"] :
                    name === "react"   ? ["react","reactjs"] :
                    [name];
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
  try {
    const resp = await fetch(`${API_BASE}/api/analyze-cv`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({text: rawText}),
      signal: AbortSignal.timeout(30000),
    });
    if (resp.ok) {
      const data = await resp.json();
      if (!data.fallback && Array.isArray(data.skills) && data.skills.length > 0) {
        aiResult = data;
      } else if (data.fallback) {
        console.warn("[AI] Fallback:", data.error);
      }
    }
  } catch (e) {
    console.warn("[AI] Endpoint ikke tilgængeligt – bruger regelbaseret analyse", e.message);
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

    // Normalisér AI-kompetencer (sikr at alle felter er der)
    const aiSkills = (aiResult.skills || []).map(s => ({
      name:       s.name || "",
      cat:        s.cat  || "Forretning",
      confidence: s.confidence ?? 70,
      inferred:   s.inferred ?? false,
      hits:       s.hits ?? 1,
    })).filter(s => s.name.length > 1);

    // Merge: AI-skills + regelbaserede (regelbaserede tilføjer hvad AI evt. gik glip af)
    const merged = {};
    aiSkills.forEach(s => { merged[s.name.toLowerCase()] = s; });
    ruleSkills.forEach(s => {
      const k = s.name.toLowerCase();
      if (!merged[k]) merged[k] = s;
    });
    skills = Object.values(merged).sort((a,b) => {
      if (!a.inferred && b.inferred) return -1;
      if (a.inferred && !b.inferred) return 1;
      return b.confidence - a.confidence;
    });

    roleFamily = aiResult.roleFamily || detectRoleFamily(skills, roles[0]?.title || "");
    strengths  = aiResult.strengths?.length ? aiResult.strengths
               : buildStrengths(skills, seniority, education);

    // Brug AI's seniority/years/education/languages hvis bedre
    const finalYears     = aiResult.years     ?? years;
    const finalSeniority = aiResult.seniority ?? seniority;
    const finalEducation = aiResult.education ?? education;
    const finalLanguages = aiResult.languages?.length ? aiResult.languages : languages;

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
      totalSkills: skills.length, explicitCount, inferredCount,
      aiAnalyzed, aiModel: aiResult.model,
    };
  }

  // Ren regelbaseret fallback
  onProgress?.("Bygger profil...");
  skills     = ruleSkills;
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
function scoreJob(profile, job, prefs) {
  if (!profile) return null;
  const jobText = norm(job.title+" "+job.description+" "+(job.keywords||[]).join(" "));
  const jobSkills = new Set(extractSkillsFromText(job.title+" "+job.description+" "+(job.keywords||[]).join(" ")).map(s=>s.name));
  const cvSkills  = new Set(profile.skills.map(s=>s.name));

  // 1. Skill overlap (45%) — explicit matches count fully, inferred count at 0.65 weight
  const cvSkillsMap = new Map(profile.skills.map(s=>[s.name, s]));
  const matched = [...cvSkills].filter(s => jobSkills.has(s));
  const weightedMatchScore = matched.reduce((sum, name) => {
    const sk = cvSkillsMap.get(name);
    return sum + (sk?.inferred ? 0.65 : 1.0);
  }, 0);
  const skillScore = jobSkills.size === 0 ? 50 : Math.round((weightedMatchScore / Math.max(jobSkills.size, 1)) * 100);

  // 2. Role family match (25%)
  const jobFamily = detectRoleFamily(extractSkillsFromText(jobText), job.title);
  const roleScore = profile.roleFamily === jobFamily ? 100
    : (profile.skills.some(s => s.cat === jobFamily) ? 60 : 30);

  // 3. Seniority match (20%)
  let senScore = 70;
  const sen = profile.seniority;
  const reqMatch = jobText.match(/(\d+)\+?\s*(?:år|years?)\s*erfaring/i);
  if (reqMatch) {
    const req = parseInt(reqMatch[1]);
    const yrs = profile.years ?? 0;
    const diff = yrs - req;
    if (diff >= 0 && diff <= 4) senScore = 100;
    else if (diff > 4) senScore = 80;
    else if (diff >= -1) senScore = 60;
    else senScore = 35;
  }

  // 4. Keyword density in job description (10%)
  let kwScore = 0;
  const cvKws = profile.keywords.slice(0,15);
  cvKws.forEach(k => { if (jobText.includes(norm(k))) kwScore += 100/cvKws.length; });
  kwScore = Math.round(kwScore);

  // 5. Præference-bonus (op til +12 point)
  let prefBonus = 0;
  if (prefs) {
    if (prefs.workMode && prefs.workMode !== 'Ligegyldigt' && job.workMode === prefs.workMode) prefBonus += 6;
    if (prefs.industries?.length && prefs.industries.includes(job.industry)) prefBonus += 6;
  }

  const total = Math.min(Math.max(Math.round(
    skillScore*.45 + roleScore*.25 + senScore*.20 + kwScore*.10
  ) + prefBonus, 10), 99);

  // Reasons
  const reasons = [];
  if (matched.length > 0) reasons.push(`${matched.length} kompetencer matcher: ${matched.slice(0,3).join(", ")}`);
  else reasons.push("Ingen direkte kompetence-overlap");
  if (roleScore >= 90) reasons.push("Stillingsniveauet passer din profil");
  else if (roleScore >= 55) reasons.push("Delvist match på faglig retning");
  if (senScore >= 90) reasons.push("Erfaringskrav matcher dit niveau");
  else if (senScore < 40) reasons.push("Kræver mere erfaring end angivet i CV");

  // Skill gaps
  const gaps = [...jobSkills].filter(s => !cvSkills.has(s)).slice(0,4);

  return { total, skillScore, roleScore, senScore, kwScore, matched, gaps, reasons };
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

/* ═══════════════════════ PROFILE SCREEN ════════════════════════════════════ */
const ProfileScreen = ({ profile, jobs, onContinue, onReupload }) => {
  const topCats = Object.entries(profile.skillsByCategory)
    .sort((a,b)=>b[1].length - a[1].length)
    .slice(0,6);

  return (
    <div style={{minHeight:'100vh',background:'var(--bg)'}}>
      {/* Nav */}
      <div style={{background:'rgba(251,249,244,0.92)',borderBottom:'1px solid var(--border)',backdropFilter:'blur(8px)',padding:'0 24px',height:52,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <Logo/>
        <div style={{display:'flex',gap:8}}>
          <button onClick={onReupload} style={{fontSize:13,color:'var(--muted)',padding:'5px 10px',border:'1px solid var(--border2)',display:'flex',alignItems:'center',gap:5}}>
            <Ic n="upload" s={13}/>Skift CV
          </button>
          <button onClick={onContinue} style={{fontSize:12,fontWeight:700,padding:'7px 18px',background:'linear-gradient(45deg,var(--navy-dark),var(--navy))',color:'#fff',display:'flex',alignItems:'center',gap:5,letterSpacing:'.02em'}}>
            Se job-matches<Ic n="arrow" s={13}/>
          </button>
        </div>
      </div>

      <div style={{maxWidth:860,margin:'0 auto',padding:'32px 24px'}}>
        {/* Header */}
        <div style={{marginBottom:28}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6}}>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:'.08em',color:'var(--muted)',textTransform:'uppercase',fontFamily:'Manrope,sans-serif'}}>DIN PROFIL – BYGGET FRA CV</div>
            {profile.aiAnalyzed
              ? <span style={{fontSize:10,fontWeight:700,letterSpacing:'.04em',padding:'2px 8px',background:'linear-gradient(90deg,#0f2a4a,#1a4a7a)',color:'#fff',display:'flex',alignItems:'center',gap:4}}>
                  <span>✦</span> AI-ANALYSERET
                </span>
              : <span style={{fontSize:10,color:'var(--faint)',letterSpacing:'.03em'}}>REGELBASERET</span>
            }
          </div>
          <h1 style={{fontSize:28,fontWeight:400,letterSpacing:'-.02em',fontFamily:'Newsreader,Georgia,serif'}}>{profile.roleFamily}</h1>
          <div style={{display:'flex',alignItems:'center',gap:12,marginTop:8,flexWrap:'wrap'}}>
            <span style={{fontSize:13,padding:'3px 10px',background:'var(--accent-bg)',color:'var(--navy)',fontWeight:500,border:'none'}}>{profile.seniority}</span>
            {profile.years && <span style={{fontSize:13,color:'var(--muted)'}}>{profile.years}+ års erfaring</span>}
            {profile.education && <span style={{fontSize:13,color:'var(--muted)'}}>{profile.education}</span>}
            {profile.languages?.length > 0 && <span style={{fontSize:13,color:'var(--muted)'}}>{profile.languages.join(', ')}</span>}
            {profile.aiModel && <span style={{fontSize:11,color:'var(--faint)'}}>via {profile.aiModel}</span>}
            <span style={{fontSize:12,color:'var(--faint)',display:'flex',alignItems:'center',gap:3}}><Ic n="file" s={12}/>{profile.fileName}</span>
          </div>
        </div>

        {/* Stats row */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:24}}>
          {[
            {label:'Kompetencer fundet', val:profile.totalSkills},
            {label:'Direkte nøgleord', val:profile.explicitCount??profile.totalSkills},
            {label:'Udledt fra kontekst', val:profile.inferredCount??0},
            {label:'Fagkategorier', val:Object.keys(profile.skillsByCategory).length},
          ].map(({label,val})=>(
            <div key={label} style={{background:'var(--surface-low)',padding:'14px 16px'}}>
              <div style={{fontSize:22,fontWeight:800,color:'var(--navy)',fontFamily:'Newsreader,Georgia,serif'}}>{val}</div>
              <div style={{fontSize:12,color:'var(--muted)',marginTop:2}}>{label}</div>
            </div>
          ))}
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 280px',gap:16}}>
          {/* Skills by category */}
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <div style={{background:'var(--surface-low)',padding:'16px 18px'}}>
              <div style={{fontSize:10,fontWeight:700,letterSpacing:'.08em',color:'var(--muted)',textTransform:'uppercase',fontFamily:'Manrope,sans-serif',marginBottom:14}}>KOMPETENCER EFTER KATEGORI</div>
              {topCats.map(([cat,skills])=>(
                <div key={cat} style={{marginBottom:14}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
                    <span style={{fontSize:13,fontWeight:500}}>{cat}</span>
                    <span style={{fontSize:12,color:'var(--muted)'}}>{skills.length} kompetencer</span>
                  </div>
                  <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                    {skills.slice(0,10).map(s=>(
                      <div key={s.name} style={{position:'relative'}}>
                        <span title={s.inferred ? `Udledt fra kontekst (${s.confidence}% sikkerhed)` : `Direkte match (${s.confidence}% sikkerhed)`} style={{
                          display:'inline-flex',alignItems:'center',gap:4,fontSize:12,padding:'3px 9px',
                          background: s.inferred
                            ? (s.confidence>=75 ? '#f0f4f8' : 'var(--surface-high)')
                            : (s.confidence>=80 ? 'var(--accent-bg)' : s.confidence>=50 ? 'var(--surface-low)' : 'var(--surface-high)'),
                          border: s.inferred ? '1px dashed rgba(0,33,71,0.25)' : 'none',
                          color: s.inferred
                            ? (s.confidence>=75 ? '#3a5a80' : 'var(--muted)')
                            : (s.confidence>=80 ? 'var(--navy)' : 'var(--muted)'),
                          fontWeight: (!s.inferred && s.confidence>=80) ? 500 : 400,
                        }}>
                          {s.inferred && <span style={{fontSize:9,opacity:.7}}>✦</span>}
                          {s.name}
                        </span>
                      </div>
                    ))}
                    {skills.length > 10 && <span style={{fontSize:12,color:'var(--faint)',alignSelf:'center'}}>+{skills.length-10}</span>}
                  </div>
                </div>
              ))}
              {/* Legend */}
              {profile.inferredCount > 0 && (
                <div style={{marginTop:12,paddingTop:10,borderTop:'1px solid var(--border)',display:'flex',gap:16,flexWrap:'wrap'}}>
                  <span style={{fontSize:11,color:'var(--muted)',display:'flex',alignItems:'center',gap:4}}>
                    <span style={{display:'inline-flex',alignItems:'center',gap:3,padding:'1px 6px',border:'none',background:'var(--accent-bg)',color:'var(--navy)',fontSize:11}}>●</span>
                    Direkte nøgleord fra CV
                  </span>
                  <span style={{fontSize:11,color:'var(--muted)',display:'flex',alignItems:'center',gap:4}}>
                    <span style={{display:'inline-flex',alignItems:'center',gap:3,padding:'1px 6px',border:'1px dashed rgba(0,33,71,0.25)',background:'#f0f4f8',color:'#3a5a80',fontSize:11}}>✦</span>
                    Udledt mellem linjerne
                  </span>
                </div>
              )}
            </div>

            {/* Experience */}
            {profile.roles.length > 0 && (
              <div style={{background:'var(--surface-low)',padding:'16px 18px'}}>
                <div style={{fontSize:10,fontWeight:700,letterSpacing:'.08em',color:'var(--muted)',textTransform:'uppercase',fontFamily:'Manrope,sans-serif',marginBottom:14}}>DETEKTEREDE STILLINGER</div>
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  {profile.roles.map((r,i)=>(
                    <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:i<profile.roles.length-1?'1px solid var(--border)':'none'}}>
                      <span style={{fontSize:13,fontWeight:i===0?500:400}}>{r.title}</span>
                      {r.years && <span style={{fontSize:12,color:'var(--muted)'}}>{r.years}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar: strengths + top skills */}
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            {/* Strengths */}
            {profile.strengths.length > 0 && (
              <div style={{background:'var(--surface-low)',padding:'14px 16px'}}>
                <div style={{fontSize:10,fontWeight:700,letterSpacing:'.08em',color:'var(--muted)',textTransform:'uppercase',fontFamily:'Manrope,sans-serif',marginBottom:12}}>STYRKER IDENTIFICERET</div>
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  {profile.strengths.map((s,i)=>(
                    <div key={i} style={{display:'flex',gap:8,fontSize:13}}>
                      <span style={{color:'var(--green)',flexShrink:0,marginTop:1}}><Ic n="check" s={13}/></span>
                      <span style={{color:'var(--text)',lineHeight:1.45}}>{s}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top keywords */}
            <div style={{background:'var(--surface-low)',padding:'14px 16px'}}>
              <div style={{fontSize:10,fontWeight:700,letterSpacing:'.08em',color:'var(--muted)',textTransform:'uppercase',fontFamily:'Manrope,sans-serif',marginBottom:12}}>TOP NØGLEORD FRA CV</div>
              <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                {profile.keywords.slice(0,16).map((k,i)=>(
                  <span key={k} style={{fontSize:12,padding:'3px 8px',background:i<5?'var(--accent-bg)':'var(--bg)',border:'none',color:i<5?'var(--navy)':'var(--muted)',fontWeight:i<5?500:400}}>
                    {k}
                  </span>
                ))}
              </div>
            </div>

            {/* CTA */}
            <button onClick={onContinue}
              style={{padding:'13px',background:'linear-gradient(45deg,var(--navy-dark),var(--navy))',color:'#fff',fontWeight:700,fontSize:13,display:'flex',alignItems:'center',justifyContent:'center',gap:6,letterSpacing:'.02em'}}>
              Se dine job-matches<Ic n="arrow" s={14}/>
            </button>
            <p style={{fontSize:11,color:'var(--faint)',textAlign:'center',lineHeight:1.5}}>
              Alle {(jobs||MOCK_JOBS).length} job scores nu mod din præcise profil
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
  {val:"Remote",   icon:"🏠", label:"Remote"},
  {val:"Hybrid",   icon:"🔄", label:"Hybrid"},
  {val:"Kontor",   icon:"🏢", label:"Kontor"},
  {val:"Ligegyldigt", icon:"🤷", label:"Ligegyldigt"},
];
const PREF_SALARIES = ["Under 35k","35–50k","50–65k","65–80k","80k+"];
const PREF_STATUS = [
  {val:"aktiv",  label:"Aktivt søgende", sub:"Klar til at starte hurtigt"},
  {val:"aaben",  label:"Åben for muligheder", sub:"Venter på det rigtige job"},
  {val:"kigger", label:"Bare kigger", sub:"Ingen hast"},
];

const PrefChip = ({selected, onClick, children}) => (
  <button onClick={onClick} style={{
    padding:'7px 14px', fontSize:12, fontWeight:selected?700:400,
    border:`1.5px solid ${selected?'var(--navy)':'var(--border2)'}`,
    background:selected?'var(--navy)':'transparent',
    color:selected?'#fff':'var(--text)',
    transition:'all .15s', cursor:'pointer', fontFamily:'Manrope,sans-serif',
    letterSpacing:selected?'.02em':0,
  }}>{children}</button>
);

const PreferencesScreen = ({profile, onDone, onReupload}) => {
  const [workMode, setWorkMode] = useState('Ligegyldigt');
  const [industries, setIndustries] = useState(
    profile.roleFamily && PREF_INDUSTRIES.includes(profile.roleFamily)
      ? [profile.roleFamily] : []
  );
  const [salary, setSalary] = useState(null);
  const [status, setStatus] = useState('aaben');

  const toggleIndustry = ind =>
    setIndustries(prev => prev.includes(ind) ? prev.filter(x=>x!==ind) : [...prev, ind]);

  const handleDone = () => onDone({workMode, industries, salary, status});

  return (
    <div style={{minHeight:'100vh', background:'var(--bg)'}}>
      {/* Nav */}
      <div style={{background:'rgba(251,249,244,0.92)',borderBottom:'1px solid var(--border)',backdropFilter:'blur(8px)',padding:'0 24px',height:52,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <Logo/>
        <button onClick={onReupload} style={{fontSize:13,color:'var(--muted)',padding:'5px 10px',border:'1px solid var(--border2)',display:'flex',alignItems:'center',gap:5}}>
          <Ic n="upload" s={13}/>Skift CV
        </button>
      </div>

      <div style={{maxWidth:600, margin:'0 auto', padding:'40px 24px'}}>
        {/* Header */}
        <div style={{marginBottom:36, textAlign:'center'}}>
          <div style={{width:48,height:48,background:'var(--green-bg)',border:'1px solid var(--green-bd)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 16px',fontSize:22}}>✓</div>
          <h1 style={{fontSize:28,fontWeight:400,letterSpacing:'-.02em',marginBottom:8,fontFamily:'Newsreader,Georgia,serif'}}>Profil klar!</h1>
          <p style={{color:'var(--muted)',fontSize:15,lineHeight:1.6}}>
            Svar på 4 hurtige spørgsmål så vi kan fine-tune dine matches.
          </p>
        </div>

        <div style={{display:'flex',flexDirection:'column',gap:28}}>

          {/* Q1: Arbejdsform */}
          <div style={{background:'var(--surface-low)',padding:'20px 22px'}}>
            <div style={{fontSize:13,fontWeight:600,marginBottom:14}}>Hvilken arbejdsform foretrækker du?</div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              {PREF_WORK_MODES.map(({val,icon,label})=>(
                <PrefChip key={val} selected={workMode===val} onClick={()=>setWorkMode(val)}>
                  {icon} {label}
                </PrefChip>
              ))}
            </div>
          </div>

          {/* Q2: Brancher */}
          <div style={{background:'var(--surface-low)',padding:'20px 22px'}}>
            <div style={{fontSize:13,fontWeight:600,marginBottom:4}}>Hvilke brancher er du interesseret i?</div>
            <div style={{fontSize:12,color:'var(--muted)',marginBottom:14}}>Vælg én eller flere</div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              {PREF_INDUSTRIES.map(ind=>(
                <PrefChip key={ind} selected={industries.includes(ind)} onClick={()=>toggleIndustry(ind)}>
                  {ind}
                </PrefChip>
              ))}
            </div>
          </div>

          {/* Q3: Løn */}
          <div style={{background:'var(--surface-low)',padding:'20px 22px'}}>
            <div style={{fontSize:13,fontWeight:600,marginBottom:4}}>Hvad er dit lønniveau? <span style={{fontWeight:400,color:'var(--faint)'}}>(månedlig brutto)</span></div>
            <div style={{fontSize:12,color:'var(--muted)',marginBottom:14}}>Valgfrit — bruges til at filtrere opslag med løn angivet</div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              {PREF_SALARIES.map(s=>(
                <PrefChip key={s} selected={salary===s} onClick={()=>setSalary(prev=>prev===s?null:s)}>
                  {s} kr/md
                </PrefChip>
              ))}
            </div>
          </div>

          {/* Q4: Status */}
          <div style={{background:'var(--surface-low)',padding:'20px 22px'}}>
            <div style={{fontSize:13,fontWeight:600,marginBottom:14}}>Hvor aktivt søger du?</div>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {PREF_STATUS.map(({val,label,sub})=>(
                <button key={val} onClick={()=>setStatus(val)} style={{
                  display:'flex',alignItems:'center',gap:12,padding:'12px 14px',
                  border:`1.5px solid ${status===val?'var(--navy)':'var(--border2)'}`,
                  background:status===val?'var(--surface-low)':'transparent',
                  textAlign:'left',cursor:'pointer',transition:'all .15s',
                }}>
                  <div style={{width:18,height:18,border:`1.5px solid ${status===val?'var(--navy)':'var(--border2)'}`,background:status===val?'var(--navy)':'transparent',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
                    {status===val&&<div style={{width:6,height:6,background:'#fff'}}/>}
                  </div>
                  <div>
                    <div style={{fontSize:13,fontWeight:status===val?600:400,color:status===val?'var(--navy)':'var(--text)'}}>{label}</div>
                    <div style={{fontSize:12,color:'var(--muted)',marginTop:1}}>{sub}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* CTA */}
          <button onClick={handleDone} style={{padding:'14px',background:'linear-gradient(45deg,var(--navy-dark),var(--navy))',color:'#fff',fontWeight:700,fontSize:13,display:'flex',alignItems:'center',justifyContent:'center',gap:8,letterSpacing:'.02em'}}>
            Se mine job-matches <Ic n="arrow" s={15}/>
          </button>
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════ JOB ROW ════════════════════════════════════════════ */
const JobRow = ({job,match,selected,onSelect,saved,applied,onSave}) => {
  const [hov,setHov]=useState(false);
  return (
    <div onClick={onSelect} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{display:'flex',alignItems:'flex-start',gap:10,padding:'11px 14px',borderLeft:`3px solid ${selected?'var(--navy)':'transparent'}`,borderBottom:'1px solid var(--border)',background:selected?'var(--surface-low)':hov?'var(--surface-low)':'var(--bg)',cursor:'pointer',transition:'background .1s'}}>
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
            <button onClick={e=>{e.stopPropagation();onSave(job.id)}} style={{color:saved?'var(--navy)':'var(--faint)',padding:'1px',transition:'color .15s'}}>
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
        {match?.matched?.length>0 && (
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
            style={{display:'flex',alignItems:'center',gap:5,padding:'9px 18px',background:'linear-gradient(45deg,var(--navy-dark),var(--navy))',color:'#fff',fontSize:12,fontWeight:700,letterSpacing:'.02em',opacity:appState==='gen'?.7:1}}>
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
            <div style={{fontSize:10,fontWeight:700,letterSpacing:'.08em',color:'var(--muted)',textTransform:'uppercase',fontFamily:'Manrope,sans-serif',marginBottom:12}}>MATCH-ANALYSE</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              {[
                {l:'Kompetencer',v:match.skillScore},
                {l:'Faglig retning',v:match.roleScore},
                {l:'Erfaringsniveau',v:match.senScore},
                {l:'Nøgleord',v:match.kwScore},
              ].map(({l,v})=>(
                <div key={l}>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:4}}>
                    <span style={{color:'var(--muted)'}}>{l}</span>
                    <span style={{fontWeight:500,color:v>=75?'var(--green)':v>=50?'var(--amber)':'var(--faint)'}}>{v}%</span>
                  </div>
                  <div style={{height:2,background:'var(--surface-high)'}}>
                    <div className="bar" style={{height:3,width:`${v}%`,background:v>=75?'var(--green)':v>=50?'var(--amber)':'var(--faint)'}}/>
                  </div>
                </div>
              ))}
            </div>

            {match.matched?.length>0 && (
              <div style={{marginTop:10}}>
                <span style={{fontSize:11,color:'var(--muted)',fontWeight:500}}>Dine matchende kompetencer: </span>
                <div style={{display:'flex',flexWrap:'wrap',gap:4,marginTop:5}}>
                  {match.matched.map(k=>(
                    <span key={k} style={{fontSize:11,padding:'2px 7px',background:'var(--green-bg)',border:'1px solid var(--green-bd)',color:'var(--green)',fontWeight:500}}>{k}</span>
                  ))}
                </div>
              </div>
            )}

            {match.gaps?.length>0 && (
              <div style={{marginTop:8}}>
                <span style={{fontSize:11,color:'var(--muted)',fontWeight:500}}>Kompetencegab (ikke i dit CV): </span>
                <div style={{display:'flex',flexWrap:'wrap',gap:4,marginTop:5}}>
                  {match.gaps.map(k=>(
                    <span key={k} style={{fontSize:11,padding:'2px 7px',background:'#FFF8F0',border:'1px solid #FDCFA4',color:'var(--amber)',fontWeight:500}}>{k}</span>
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
                  style={{flex:1,padding:'9px',background:applied?'var(--green)':'linear-gradient(45deg,var(--navy-dark),var(--navy))',color:'#fff',fontSize:12,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',gap:5,transition:'background .2s',cursor:applied?'default':'pointer',letterSpacing:'.02em'}}>
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

const ProfileDashboard = ({profile,prefs,savedIds,appliedJobs,jobsDB,matches,onSelectJob,onApplyStatus,onReupload}) => {
  const topMatch = useMemo(()=>{
    const vals = Object.values(matches).filter(Boolean).map(m=>m.total);
    return vals.length ? Math.max(...vals) : null;
  },[matches]);

  const savedJobObjs = useMemo(()=>
    savedIds.map(id=>jobsDB.find(j=>j.id===id)).filter(Boolean)
  ,[savedIds,jobsDB]);

  const catData = useMemo(()=>{
    if(!profile) return [];
    return Object.entries(profile.skillsByCategory||{})
      .map(([cat,skills])=>({cat,count:skills.length}))
      .sort((a,b)=>b.count-a.count).slice(0,7);
  },[profile]);
  const maxCat = Math.max(...catData.map(d=>d.count),1);

  const initials = (profile?.roleFamily||'CV').split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();

  return (
    <div style={{flex:1,overflowY:'auto',background:'var(--bg)'}}>
      <div style={{maxWidth:820,margin:'0 auto',padding:'24px 20px 40px'}}>

        {/* Hero card */}
        <div style={{background:'var(--surface-low)',padding:'22px 24px',marginBottom:14,display:'flex',alignItems:'flex-start',gap:18}}>
          <div style={{width:54,height:54,background:'linear-gradient(135deg,var(--navy),#3B82F6)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <span style={{color:'#fff',fontWeight:800,fontSize:18,letterSpacing:-.5}}>{initials}</span>
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:20,fontWeight:400,marginBottom:5,letterSpacing:'-.01em',fontFamily:'Newsreader,Georgia,serif'}}>{profile?.roleFamily||'Din profil'}</div>
            <div style={{display:'flex',gap:7,flexWrap:'wrap',marginBottom:10,alignItems:'center'}}>
              <span style={{fontSize:12,padding:'3px 9px',background:'var(--accent-bg)',color:'var(--navy)',border:'none',fontWeight:500}}>{profile?.seniority||'—'}</span>
              {profile?.years&&<span style={{fontSize:12,color:'var(--muted)'}}>{profile.years}+ års erfaring</span>}
              {profile?.education&&<span style={{fontSize:12,color:'var(--muted)'}}>{profile.education}</span>}
              {profile?.languages?.slice(0,2).map(l=><span key={l} style={{fontSize:12,color:'var(--muted)'}}>{l}</span>)}
            </div>
            <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
              {profile?.skills?.slice(0,12).map((s,i)=>{
                const isInferred = s.inferred;
                return (
                  <span key={s.name} title={isInferred?'Udledt fra kontekst':undefined} style={{fontSize:11,padding:'2px 8px',
                    display:'inline-flex',alignItems:'center',gap:3,
                    background: isInferred ? '#f0f4f8' : (i<4?'var(--accent-bg)':'var(--bg)'),
                    border: isInferred ? '1px dashed rgba(0,33,71,0.22)' : 'none',
                    color: isInferred ? '#3a5a80' : (i<4?'var(--navy)':'var(--muted)'),
                    fontWeight:(!isInferred&&i<4)?500:400}}>
                    {isInferred&&<span style={{fontSize:8,opacity:.7}}>✦</span>}
                    {s.name}
                  </span>
                );
              })}
              {(profile?.skills?.length||0)>12&&<span style={{fontSize:11,color:'var(--faint)'}}>+{profile.skills.length-12} mere</span>}
            </div>
          </div>
          <button onClick={onReupload} style={{fontSize:12,color:'var(--muted)',padding:'6px 11px',border:'1px solid var(--border2)',display:'flex',alignItems:'center',gap:4,flexShrink:0,background:'var(--surface)'}}>
            <Ic n="upload" s={12}/>Opdater CV
          </button>
        </div>

        {/* Stats row */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:14}}>
          {[
            {label:'Kompetencer total',  val:profile?.totalSkills||0,  color:'var(--navy)'},
            {label:'Udledt fra kontekst', val:profile?.inferredCount||0, color:'#3a5a80'},
            {label:'Gemte jobs',   val:savedIds.length,          color:'#B45309'},
            {label:'Top match',    val:topMatch!=null?`${topMatch}%`:'—', color:'var(--green)'},
          ].map(({label,val,color})=>(
            <div key={label} style={{background:'var(--surface-low)',padding:'14px 16px'}}>
              <div style={{fontSize:26,fontWeight:800,color,marginBottom:2,fontFamily:'Newsreader,Georgia,serif'}}>{val}</div>
              <div style={{fontSize:11,color:'var(--muted)'}}>{label}</div>
            </div>
          ))}
        </div>

        {/* Skills + Prefs */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 240px',gap:14,marginBottom:14}}>
          {/* Skills */}
          <div style={{background:'var(--surface-low)',padding:'16px 18px'}}>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:'.08em',color:'var(--muted)',textTransform:'uppercase',fontFamily:'Manrope,sans-serif',marginBottom:14}}>KOMPETENCER EFTER KATEGORI</div>
            {catData.map(({cat,count})=>(
              <div key={cat} style={{marginBottom:11}}>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:4}}>
                  <span>{cat}</span>
                  <span style={{color:'var(--muted)',fontWeight:500}}>{count}</span>
                </div>
                <div style={{height:4,background:'var(--surface-high)'}}>
                  <div className="bar" style={{height:5,width:`${(count/maxCat)*100}%`,background:'var(--navy)'}}/>
                </div>
              </div>
            ))}
            {profile?.roles?.length>0&&(
              <div style={{marginTop:14,paddingTop:14,borderTop:'1px solid var(--border)'}}>
                <div style={{fontSize:10,fontWeight:700,letterSpacing:'.08em',color:'var(--muted)',textTransform:'uppercase',fontFamily:'Manrope,sans-serif',marginBottom:10}}>TIDLIGERE STILLINGER</div>
                {profile.roles.slice(0,4).map((r,i)=>(
                  <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:i<Math.min(profile.roles.length,4)-1?'1px solid var(--border)':'none'}}>
                    <span style={{fontSize:12,fontWeight:i===0?500:400}}>{r.title}</span>
                    {r.years&&<span style={{fontSize:11,color:'var(--faint)'}}>{r.years}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Preferences */}
          <div style={{background:'var(--surface-low)',padding:'16px 18px'}}>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:'.08em',color:'var(--muted)',textTransform:'uppercase',fontFamily:'Manrope,sans-serif',marginBottom:14}}>DINE PRÆFERENCER</div>
            {prefs ? <>
              <PrefRow label="Arbejdsform" icon={PREF_WORK_MODES.find(x=>x.val===prefs.workMode)?.icon} val={prefs.workMode}/>
              <PrefRow label="Brancher" val={prefs.industries?.length?prefs.industries.join(', '):'Alle'}/>
              <PrefRow label="Lønniveau" val={prefs.salary?`${prefs.salary} kr/md`:'Ikke angivet'}/>
              <PrefRow label="Søgestatus" val={PREF_STATUS.find(x=>x.val===prefs.status)?.label||prefs.status}/>
            </> : (
              <div style={{fontSize:13,color:'var(--faint)',lineHeight:1.6}}>Ingen præferencer sat. Upload dit CV for at komme i gang.</div>
            )}
          </div>
        </div>

        {/* Saved jobs */}
        <div style={{background:'var(--surface-low)',marginBottom:14}}>
          <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:'.08em',color:'var(--muted)',textTransform:'uppercase',fontFamily:'Manrope,sans-serif'}}>GEMTE JOB</div>
            <span style={{fontSize:12,color:'var(--faint)'}}>{savedJobObjs.length} job</span>
          </div>
          {savedJobObjs.length===0
            ? <div style={{padding:'20px',textAlign:'center',color:'var(--faint)',fontSize:13}}>Ingen gemte job endnu — tryk på bogmærke-ikonet på et job</div>
            : savedJobObjs.map((j,i)=>(
              <button key={j.id} onClick={()=>onSelectJob(j)}
                style={{width:'100%',display:'flex',alignItems:'center',gap:12,padding:'11px 16px',borderBottom:i<savedJobObjs.length-1?'1px solid var(--border)':'none',background:'transparent',textAlign:'left',cursor:'pointer',transition:'background .1s'}}
                onMouseEnter={e=>e.currentTarget.style.background='var(--bg)'}
                onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <div style={{width:32,height:32,background:'var(--surface-high)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:13,color:'var(--muted)',flexShrink:0}}>{j.company[0]}</div>
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

        {/* Applied jobs */}
        <div style={{background:'var(--surface-low)'}}>
          <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:'.08em',color:'var(--muted)',textTransform:'uppercase',fontFamily:'Manrope,sans-serif'}}>ANSØGTE JOB</div>
            <span style={{fontSize:12,color:'var(--faint)'}}>{appliedJobs.length} job</span>
          </div>
          {appliedJobs.length===0
            ? <div style={{padding:'20px',textAlign:'center',color:'var(--faint)',fontSize:13}}>Ingen ansøgte job endnu — skriv en ansøgning og marker den som sendt</div>
            : appliedJobs.map((a,i)=>{
              const si = APPLIED_STATUSES.find(s=>s.val===a.status)||APPLIED_STATUSES[0];
              return (
                <div key={a.id} style={{display:'flex',alignItems:'center',gap:12,padding:'11px 16px',borderBottom:i<appliedJobs.length-1?'1px solid var(--border)':'none'}}>
                  <div style={{width:32,height:32,background:'var(--surface-high)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:13,color:'var(--muted)',flexShrink:0}}>{a.company[0]}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.title}</div>
                    <div style={{fontSize:12,color:'var(--muted)'}}>{a.company} · {a.date}</div>
                  </div>
                  <select value={a.status} onChange={e=>onApplyStatus(a.id,e.target.value)}
                    style={{padding:'4px 8px',border:`1px solid ${si.color}`,fontSize:11,color:si.color,background:'var(--surface)',outline:'none',fontWeight:600,cursor:'pointer'}}>
                    {APPLIED_STATUSES.map(s=><option key={s.val} value={s.val}>{s.label}</option>)}
                  </select>
                </div>
              );
            })
          }
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
  const [jobsDB,setJobsDB] = useState(jobs);
  const [realJobs,setRealJobs] = useState(!!jobsLoaded);
  const [refreshing,setRefreshing] = useState(false);

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
    jobsDB.forEach(j=>{ m[j.id]=scoreJob(profile,j,prefs); });
    return m;
  },[profile,jobsDB,prefs]);

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
          onReupload={onReupload}/>
      )}

      {/* Jobs / Gemt tabs */}
      {tab!=='profil'&&(
        <div style={{flex:1,display:'flex',overflow:'hidden'}}>
          {/* Left */}
          <div style={{width:selected?'42%':'100%',display:'flex',flexDirection:'column',borderRight:selected?'1px solid var(--border)':'none',overflow:'hidden',transition:'width .2s'}}>
            {/* Filters */}
            <div style={{padding:'10px 12px',borderBottom:'1px solid var(--border)',background:'var(--surface)',flexShrink:0,display:'flex',flexDirection:'column',gap:7}}>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Søg på titel, virksomhed..."
                style={{width:'100%',padding:'7px 10px',border:'none',borderBottom:'1px solid var(--border2)',fontSize:13,outline:'none',background:'transparent',padding:'7px 0'}}
                onFocus={e=>e.target.style.borderColor='var(--navy)'}
                onBlur={e=>e.target.style.borderColor='var(--border)'}/>
              <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
                <select value={industryF} onChange={e=>setIndustryF(e.target.value)}
                  style={{padding:'5px 8px',border:'none',borderBottom:'1px solid var(--border2)',fontSize:12,background:'transparent',outline:'none',color:'var(--text)',padding:'4px 0'}}>
                  {industries.map(i=><option key={i}>{i}</option>)}
                </select>
                <select value={modeF} onChange={e=>setModeF(e.target.value)}
                  style={{padding:'5px 8px',border:'none',borderBottom:'1px solid var(--border2)',fontSize:12,background:'transparent',outline:'none',color:'var(--text)',padding:'4px 0'}}>
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
                <strong style={{color:'var(--text)'}}>{filtered.length}</strong> job
                {!realJobs&&<span style={{color:'var(--faint)'}}> · demo-data</span>}
                {realJobs&&<span style={{color:'var(--green)'}}> · Jobnet.dk</span>}
                {profile&&<span style={{color:'var(--green)'}}> · sorteret efter match</span>}
              </span>
              <button onClick={handleRefresh} disabled={refreshing}
                style={{fontSize:11,color:'var(--navy)',display:'flex',alignItems:'center',gap:3,padding:'2px 7px',border:'none',background:'var(--accent-bg)',opacity:refreshing?.6:1}}>
                <span className={refreshing?'spin':''}><Ic n="refresh" s={11}/></span>
                {refreshing?'Henter...':'Opdater'}
              </button>
            </div>

            {/* Job list */}
            <div style={{flex:1,overflowY:'auto'}}>
              {filtered.length===0
                ? <div style={{padding:32,textAlign:'center',color:'var(--muted)',fontSize:13}}>
                    {tab==='gemt'?'Ingen gemte job endnu.':'Ingen job matcher filtrene.'}
                  </div>
                : filtered.map(j=>(
                  <JobRow key={j.id} job={j} match={matches[j.id]}
                    selected={selected?.id===j.id} onSelect={()=>setSelected(j)}
                    saved={savedIds.includes(j.id)} applied={isApplied(j.id)}
                    onSave={toggleSave}/>
                ))
              }
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
          <div style={{fontSize:11,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--terra)',marginBottom:20,fontFamily:'Manrope,sans-serif'}}>Jobsøgning · Redesignet</div>
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
            style={{border:`1.5px dashed ${drag?'var(--navy)':'var(--border2)'}`,padding:'52px 32px',cursor:'pointer',transition:'all .15s',background:drag?'var(--accent-bg)':'var(--surface-low)',maxWidth:440,margin:'0 auto'}}>
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
    <div style={{width:26,height:26,background:'linear-gradient(45deg,var(--navy-dark),var(--navy))',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
      <span style={{color:'#fff',fontWeight:800,fontSize:14,lineHeight:1,fontFamily:'Newsreader,Georgia,serif',fontStyle:'italic'}}>J</span>
    </div>
    <span style={{fontWeight:700,fontSize:16,letterSpacing:-.3,fontFamily:'Newsreader,Georgia,serif'}}>Jobr<span style={{color:'var(--terra)'}}>.</span></span>
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
            <div style={{marginBottom:18}}>
              <div style={{fontSize:11,fontWeight:700,letterSpacing:'.05em',color:'var(--muted)',marginBottom:5,textTransform:'uppercase'}}>Adgangskode</div>
              <input type="password" value={password} onChange={e=>setPassword(e.target.value)} required
                style={{width:'100%',padding:'10px 12px',border:'1px solid var(--border2)',background:'var(--surface-low)',fontSize:14,outline:'none',boxSizing:'border-box'}}
                placeholder="••••••••"/>
            </div>
            {error   && <div style={{color:'var(--red)',fontSize:13,marginBottom:12,padding:'8px 12px',background:'#fff5f5'}}>{error}</div>}
            {message && <div style={{color:'var(--green)',fontSize:13,marginBottom:12,padding:'8px 12px',background:'var(--green-bg)'}}>{message}</div>}
            <button type="submit" disabled={loading} style={{
              width:'100%',padding:'12px',background:'linear-gradient(45deg,var(--navy-dark),var(--navy))',
              color:'#fff',fontSize:14,fontWeight:600,letterSpacing:'.02em',border:'none',cursor:loading?'default':'pointer',
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
  const [jobsData,setJobsData]     = useState(MOCK_JOBS);
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

  // Hent jobs fra /api/jobs proxy (Jobnet live) – loader flere sider
  const loadJobs = useCallback(async (reset=false) => {
    setJobsLoading(true);
    try {
      const currentCount = reset ? 0 : jobsData === MOCK_JOBS ? 0 : jobsData.length;
      const pages = 5; // hent 5 sider (5×20 = 100 jobs)
      let all = reset ? [] : (jobsData === MOCK_JOBS ? [] : [...jobsData]);
      for(let i = 0; i < pages; i++) {
        const offset = currentCount + i * 20;
        const r = await fetch(`${API_BASE}/api/jobs?offset=${offset}`);
        if(!r.ok) break;
        const d = await r.json();
        if(!d.jobs || d.jobs.length === 0) break;
        all = [...all, ...d.jobs];
        if(i === 0) { setJobsData(all); setJobsLoaded(true); setJobsTotal(d.total||0); }
      }
      if(all.length > 0) { setJobsData(all); setJobsLoaded(true); }
    } catch(e) { console.warn('Jobs fetch fejl:', e.message); }
    setJobsLoading(false);
  }, [jobsData]);

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
  if (screen==='profile') return <ProfileScreen profile={profile} jobs={jobsData} onContinue={()=>setScreen('jobs')} onReupload={handleReupload}/>;
  return <JobsScreen profile={profile} prefs={prefs} jobs={jobsData} jobsLoaded={jobsLoaded} jobsLoading={jobsLoading} jobsTotal={jobsTotal} onRefresh={refreshJobs} onReupload={handleReupload} onLogout={handleLogout} user={user}/>;
};

/* ═══════════════════════ UPLOAD / PARSE SCREEN ═════════════════════════════ */
const UploadScreen = ({onProfile, initialFile}) => {
  const [state,setState]=useState(initialFile?'parsing':'idle');
  const [progress,setProgress]=useState([]);
  const [drag,setDrag]=useState(false);
  const fileRef=useRef();
  const started=useRef(false);

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
              <p style={{color:'var(--muted)',fontSize:14,marginBottom:32}}>PDF, DOCX eller TXT – analyseres direkte i browseren</p>
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
