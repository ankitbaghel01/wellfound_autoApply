/**
 * Wellfound Auto-Apply — personal data loaded from .env
 * =====================================
 * HOW TO USE:
 * 1. Log in to wellfound.com, open https://wellfound.com/jobs
 *    and set your search filters (role, location, remote, etc.).
 * 2. Open DevTools console (F12 → Console), paste this whole file, press Enter.
 * 3. It runs in DRY_RUN mode first: it fills everything but does NOT press Send.
 *    Watch one or two applications, then re-run with DRY_RUN = false to actually apply.
 *
 * NOTES:
 * - Wellfound changes its HTML often; button/field lookup is text-based to survive
 *   that, but if it stops finding things, update the SELECTORS section.
 * - Optional: put a Google Gemini API key in CONFIG.geminiKey and any question the
 *   built-in answer bank can't match gets answered by Gemini using your CV.
 * - Auto-applying may violate Wellfound's ToS and can get an account rate-limited
 *   or banned — the delays below are deliberately human-ish. Use at your own risk.
 */
(async function wellfoundAutoApply() {
  'use strict';

  // Personal data is injected by the runner from .env (window.__APPLY_CONFIG); nothing PII is hard-coded here.
  const __CFG = (typeof window !== 'undefined' && window.__APPLY_CONFIG) || {};

  // ======================= CONFIG =======================
  const CONFIG = {
    DRY_RUN: true,             // true = fill forms but never click Send. Flip to false when ready.
    MAX_APPLICATIONS: 50,      // stop after this many applications this run (runner overrides with 50/day cap minus today's count)
    // 8-20s tripped Wellfound's DataDome bot-check on Jul 31 — human pace or bust.
    // 50 apps × ~1.5-3 min ≈ 1.5-2.5h, well inside the runner's 100-min window per batch.
    MIN_DELAY_MS: 60000,       // wait between applications (randomized between min/max)
    MAX_DELAY_MS: 150000,
    geminiKey: __CFG.geminiKey || '',   // optional: Gemini API key for unmatched questions

    // Job titles to apply to (case-insensitive substring match on the job title)
    TITLE_KEYWORDS: [
      'full stack', 'fullstack', 'full-stack', 'mern', 'backend', 'back end',
      'frontend', 'front end', 'software engineer', 'software developer',
      'web developer', 'ai engineer', 'ai developer', 'ml engineer',
      'machine learning', 'deep learning', 'ai/ml', 'ai ml', 'nlp', 'llm', 'genai', 'gen ai',
      'generative ai', 'applied ai', 'computer vision', 'speech', 'data scientist',
      'ai-assisted', 'ai assisted', 'ai-first', 'ai first', 'ai-native', 'ai native', 'vibe',
      'prompt engineer', 'web dev', 'web engineer', 'web application', 'website developer',
      'react', 'node', 'javascript', 'typescript', 'python', 'svelte',
      'sde', 'member of technical staff',
    ],
    // Skip jobs whose title contains any of these
    TITLE_BLOCKLIST: [
      'senior', 'sr.', 'sr ', 'staff', 'principal', 'architect', 'head of', 'director', 'manager', 'lead', 'devops',
      'data engineer', 'qa', 'test', 'intern', 'designer', 'sales', 'marketing',
      'teacher', 'trainer', 'tutor', 'instructor', 'coach',
      '.net', 'c#', 'php', 'ruby', 'golang', 'ios', 'android native', 'flutter', 'react native',
    ],
  };

  // ======================= CV DATA (from .env via the runner) =======================
  const CV = __CFG.CV || {
    name: '', email: '', phone: '', location: '', currentRole: '', company: '', education: '',
    yearsOfExperience: '', skills: '', highlights: ['', '', '', '', ''], noticePeriod: '',
    currentCTC: '', expectedCTC: '', currentSalary: '', expectedSalary: '', dob: '', gender: '',
    workAuth: '', github: '', linkedin: '', portfolio: '', links: '', remoteOk: '', relocate: '', startDate: '',
  };

  // ============== QUESTION → ANSWER BANK ==============
  // First pattern that matches the question text wins. Answers come from the CV above.
  const QA_BANK = [
    [/company name|current (company|employer)|organi[sz]ation/i, CV.company], // before /name/ so "company name" isn't caught as a person's name
    [/years? of (work |professional )?experience|how (long|many years)/i,
      `I have ${CV.yearsOfExperience}. Hands-on with ${CV.skills.split(',').slice(0, 8).join(',')} and more.`],
    [/notice period|when can you (start|join)|start date|joining/i,
      `${CV.startDate}`],
    [/current .{0,15}(ctc|salary|compensation)/i, CV.currentSalary],
    [/(expected|desired) .{0,15}(ctc|salary|compensation|pay)|salary expectation/i, CV.expectedSalary],
    [/remote|work from home|wfh/i, CV.remoteOk],
    [/reloc|move to|shift to|based out of|work from (our )?office|on-?site/i, CV.relocate],
    [/visa|sponsorship|work authorization|legally authorized|right to work|citizen/i, CV.workAuth],
    [/where are you (based|located)|current location|city/i, CV.location],
    [/linkedin|github|portfolio|website|link/i, CV.links],
    [/why (do you want|are you interested|this role|this company|us|join)/i,
      `I ship production features end to end. ${CV.highlights[0] || ''}. This role matches my stack directly, and I want to keep building products with real ownership.`],
    [/tell (us|me) about yourself|introduce yourself|about you/i,
      `I'm ${CV.name}, ${CV.currentRole}. ${[0, 2, 3].map((i) => CV.highlights[i]).filter(Boolean).map((h) => h + '.').join(' ')}`],
    [/(biggest|proudest|favorite) (project|achievement|accomplishment)|worked on/i,
      `${CV.highlights[0] || ''}. I owned it end to end, from architecture through deployment.`],
    // stack answers come from .env (ANSWER_FRONTEND/BACKEND/AI) so they never claim skills the CV doesn't have
    [/react|frontend|front-end/i, CV.answerFrontend || `My stack: ${CV.skills}.`],
    [/node|backend|back-end|api/i, CV.answerBackend || `My stack: ${CV.skills}.`],
    [/\b(ai|llm|ml|machine learning|genai|langchain)\b/i, CV.answerAI || `My stack: ${CV.skills}.`],
    [/education|degree|university|college/i, CV.education],
    [/phone|contact number|mobile/i, CV.phone],
    [/e-?mail/i, CV.email],
    [/your name|full name|\bname\b/i, CV.name],
  ];

  const GENERIC_ANSWER =
    `I'm ${CV.name}, ${CV.currentRole}. Happy to elaborate in an interview — key highlights: ` +
    CV.highlights.slice(0, 2).join('; ') + '.';

  // ============== COVER LETTER (per-job: company + title filled in) ==============
  function coverLetter(company, title) {
    return `${CV.name}
${CV.phone} · ${CV.email}
${CV.linkedin} · ${CV.github} · ${CV.portfolio}

Dear ${company ? company + ' team' : 'Hiring Manager'},

I'd like to apply for the ${title || 'Full Stack Developer'} position at ${company || 'your company'}.

I'm currently ${CV.currentRole || 'a software developer'}, working daily with ${CV.skills.split(',').slice(0, 8).join(',').trim()}. A recent example of my work: ${CV.highlights[0] || 'shipping production features end to end'}.

${[CV.highlights[1], CV.highlights[2]].filter(Boolean).map((h) => h + '.').join(' ')}

I'm interested in this role because the ${title || 'Full Stack Developer'} role matches the stack I work in every day, and I'd get to own features end to end${company ? ' at ' + company : ''}. Happy to walk through any of the above if it's useful.

Thank you for your time.

Sincerely,
${CV.name}`;
  }

  // ======================= HELPERS =======================
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const humanDelay = () => sleep(CONFIG.MIN_DELAY_MS + Math.random() * (CONFIG.MAX_DELAY_MS - CONFIG.MIN_DELAY_MS));
  const log = (...a) => console.log('%c[auto-apply]', 'color:#0a84ff;font-weight:bold', ...a);

  // React-controlled inputs ignore plain .value writes — use the native setter + input event.
  function setValue(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype
                : el.tagName === 'SELECT' ? HTMLSelectElement.prototype
                : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function labelTextOf(el) {
    return (
      el.closest('label')?.textContent ||
      el.getAttribute('aria-label') ||
      el.getAttribute('placeholder') ||
      (el.id && document.querySelector(`label[for="${el.id}"]`)?.textContent) ||
      el.closest('div')?.previousElementSibling?.textContent ||
      el.parentElement?.textContent || ''
    ).trim();
  }

  function visible(el) {
    // getClientRects, not offsetParent — offsetParent is null for position:fixed
    // elements (modal footers), which made real Send buttons look invisible
    return el && el.getClientRects().length > 0 && !el.disabled;
  }

  // Job cards concatenate title + location + salary + "Posted 3 weeks ago" etc.
  // into one string — keep only the actual title part.
  function cleanTitle(raw) {
    return (raw || '')
      .replace(/\s+/g, ' ')
      // card text glues the location onto the title ("Software Engineer - BackendRemoteIndia")
      .replace(/(?<=[A-Za-z0-9)])(?=Remote|On-?site|Hybrid|In office)/, ' • ')
      .split(/remote only|on-?site|hybrid|in office|₹|\$\d|€|posted \d|recruiter|•|\d+\s?(?:weeks?|days?|months?|hours?)\s?ago/i)[0]
      .replace(/\(?\s*remote\s*\)?$/i, '')
      .replace(/[\s\-–—|(,/]+$/g, '')
      .trim();
  }

  // Company name from the opened job pane. Falls back to '' (letter then says
  // "Hi there team" / "your team") rather than a wrong heading like "About the job".
  function getCompany() {
    // 2026 UI: the apply panel header reads "Apply to <Company>"
    const panelHeader = [...document.querySelectorAll('h1, h2, h3, div')]
      .map((e) => (e.children.length === 0 ? e.textContent.trim() : ''))
      .find((t) => /^apply to .{2,60}$/i.test(t));
    if (panelHeader) return panelHeader.replace(/^apply to /i, '').trim();
    const el =
      document.querySelector('a[href^="/company/"] h2') ||
      document.querySelector('[data-test="StartupHeader"] h1') ||
      document.querySelector('a[href^="/company/"]');
    let name = (el?.textContent || '').split('\n')[0].replace(/\s+/g, ' ').trim();
    // Reject obvious non-names (section headings, buttons, follower counts)
    if (/about the job|about us|apply|jobs|follow|save|^$/i.test(name) || name.split(' ').length > 6) name = '';
    return name;
  }

  function findButtonByText(root, regex) {
    return [...root.querySelectorAll('button, a[role="button"], [type="submit"]')]
      .find((b) => visible(b) && regex.test(b.textContent.trim()));
  }

  async function waitFor(fn, timeoutMs = 8000, pollMs = 300) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const res = fn();
      if (res) return res;
      await sleep(pollMs);
    }
    return null;
  }

  async function answerQuestion(questionText) {
    for (const [pattern, answer] of QA_BANK) {
      if (pattern.test(questionText)) return answer;
    }
    if (CONFIG.geminiKey) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${CONFIG.geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text:
                `You are answering a job application question on my behalf. Answer in first person, 2-4 sentences, professional, no markdown.\n\nMy CV:\n${JSON.stringify(CV)}\n\nQuestion: ${questionText}` }] }],
            }),
          }
        );
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text) return text;
      } catch (e) {
        log('Gemini call failed, using generic answer:', e.message);
      }
    }
    return GENERIC_ANSWER;
  }

  // ======================= SELECTORS (edit here if Wellfound changes) =======================
  const SELECTORS = {
    // job cards in the search results list — Wellfound uses div[data-test] attrs on job listings
    jobCards: '[data-test="StartupResult"] a[href*="/jobs/"], a[href^="/jobs/"][class]',
    modal: '[role="dialog"][aria-modal="true"], [role="dialog"]',
    applyButtonText: /^apply$|apply now/i,
    // 2026 UI: the submit button in the "Apply to <Company>" panel is labeled "Apply"
    sendButtonText: /^apply$|^send$|submit|send application/i,
    alreadyApplied: /applied/i,
  };

  // ======================= APPLY TO ONE JOB (inside opened modal/pane) =======================
  async function fillAndSubmit(company, title) {
    // Scope = the "Apply to <Company>" panel only: the job dialog's <form> plus its header.
    // NOT the whole dialog/page — <html> carries class "Modal__open", so a [class*=modal]
    // match was the entire document: fills hit the search filters, and the first "Apply"
    // found was a header button that only scrolls (phantom sends, 2026-11-04).
    const found = await waitFor(() => {
      const dialog = [...document.querySelectorAll(SELECTORS.modal)].filter(visible)
        .find((d) => /apply to /i.test(d.textContent));
      if (!dialog) return null;
      const form = [...dialog.querySelectorAll('form')].filter(visible)
        .find((f) => f.querySelector('[type="submit"], textarea'));
      let panel = form;
      while (panel && panel !== dialog && !/apply to /i.test(panel.textContent)) panel = panel.parentElement;
      if (panel) return { dialog, panel };
      return /not accepting applications/i.test(dialog.textContent) ? { dialog, panel: null } : null;
    });
    if (!found) {
      log('  ⚠ no apply panel found — skipping (not counting as sent)');
      return false;
    }
    if (!found.panel) {
      log('  🚫 location-blocked by company — skipping');
      return false;
    }
    const scope = found.panel;
    // company from THIS panel's own "Apply to <Company>" header. A document-wide lookup hit a
    // leftover "Apply to <previous company>" header and mis-addressed a cover letter (2026-11-04).
    const header = (scope.innerText.match(/^\s*apply to (.{2,80}?)\s*$/im) || [])[1];
    if (header) company = header.trim();
    log(`  🏢 ${company || '?'} / ${title || '?'}`);

    // Eligibility: Wellfound warns in the panel when the profile is outside the role's
    // preferred experience ("outside the years of experience preferred … (2+ years …)").
    // Only apply where eligible — skip those.
    const notEligible = scope.innerText.match(/outside the (?:years of experience|experience)[^\n]*/i);
    if (notEligible) {
      log(`  🚫 not eligible — ${notEligible[0].slice(0, 110)}`);
      return false;
    }

    // Location-gated job ("X is not accepting applications from your current location…")
    // → Send is disabled, nothing we fill changes that. Skip immediately.
    if (/not accepting applications from your (current )?location/i.test(scope.textContent)) {
      log('  🚫 location-blocked by company — skipping');
      findButtonByText(scope, /close|cancel|×/i)?.click();
      scope.querySelector('[aria-label="Close"]')?.click();
      return false;
    }

    // 1. Cover letter: the big textarea ("What interests you about working for this company?")
    const textareas = [...scope.querySelectorAll('textarea')].filter(visible);
    if (textareas.length) {
      setValue(textareas[0], coverLetter(company, title));
      log(`  ✍ cover letter filled (to: ${company || 'Hiring Manager'} / ${title || '?'})`);
    }

    // 2. Any extra question textareas/inputs — find their label text and answer from CV
    const extraFields = [
      ...textareas.slice(1),
      ...[...scope.querySelectorAll('input[type="text"]:not([value])')].filter(visible),
    ];
    for (const field of extraFields) {
      const label = labelTextOf(field);
      if (/search/i.test(label)) continue; // page search box, not an application question
      const answer = await answerQuestion(label);
      // unknown question + optional field → leave blank rather than paste a generic paragraph
      const required = field.required || field.getAttribute('aria-required') === 'true' || /\*/.test(label);
      if (answer === GENERIC_ANSWER && !required) { log(`  ⏭ optional unknown question skipped: "${label.slice(0, 50)}"`); continue; }
      setValue(field, answer);
      log(`  ✍ answered: "${label.slice(0, 60)}..."`);
    }

    // 3a. Wellfound location-mismatch prompt:
    // "This job does not support the locations on your profile. … I am currently in… / I can relocate to…"
    // → pick "I can relocate to…", open its dropdown, choose the offered location.
    if (/does not support the locations|update your location preferences/i.test(scope.textContent)) {
      const relocateChoice = [...scope.querySelectorAll('label, [role="radio"], button, div')]
        .filter(visible)
        .find((el) => /i can relocate/i.test(el.textContent) && el.textContent.length < 80);
      if (relocateChoice) {
        relocateChoice.click();
        log('  📍 chose "I can relocate to…"');
        await sleep(800);

        // The location picker next to it: native <select> or custom combobox
        const nativeSel = [...scope.querySelectorAll('select')].filter(visible).pop();
        const combo = [...scope.querySelectorAll('[role="combobox"], input[id*="react-select" i], [class*="select" i] input')]
          .filter(visible).pop();

        if (nativeSel) {
          const opts = [...nativeSel.options].filter((o) => o.value && !/select|choose/i.test(o.text));
          if (opts.length) { setValue(nativeSel, opts[0].value); log(`  📍 location: ${opts[0].text.trim()}`); }
        } else if (combo) {
          combo.focus();
          combo.click();
          await sleep(600);
          // options may render in a portal — but only ever take THIS combobox's listbox (aria-controls /
          // aria-owns) or options inside the panel. A document-wide search clicked the search
          // filter's "No remote jobs" option instead (2026-11-04).
          const listId = combo.getAttribute('aria-controls') || combo.getAttribute('aria-owns');
          const listbox = listId && document.getElementById(listId);
          const opt = await waitFor(
            () => [...(listbox || scope).querySelectorAll('[role="option"]')].find(visible),
            3000
          );
          if (opt) { opt.click(); log(`  📍 location: ${opt.textContent.trim().slice(0, 40)}`); }
          else {
            // fallback: keyboard-select the first suggestion
            for (const key of ['ArrowDown', 'Enter']) {
              combo.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
              await sleep(300);
            }
            log('  📍 location picked via keyboard fallback');
          }
        } else {
          log('  ⚠ relocate chosen but no location dropdown found');
        }
        await sleep(500);
      }
    }

    // 3a'. The "What interests you…" box can render only AFTER the relocate choice — fill it now if
    // it's still empty (an application went out with no cover letter this way, 2026-11-04).
    const lateTa = !textareas.length && [...scope.querySelectorAll('textarea')].filter(visible).find((t) => !t.value.trim());
    if (lateTa) {
      setValue(lateTa, coverLetter(company, title));
      log(`  ✍ cover letter filled (to: ${company || 'Hiring Manager'} / ${title || '?'})`);
    }

    // 3b. Dropdowns / radios / checkboxes — relocation, work-auth, location pickers etc.
    // Preference order: my city → my country → any "yes / willing / open to" style option.
    const YES = /yes|willing|open to|agree|relocat|remote|immediat|i am able|i can/i;
    const NO_PLACEHOLDER = /^select|^choose|^--|^pick/i;

    for (const sel of [...scope.querySelectorAll('select')].filter(visible)) {
      const opts = [...sel.options].filter((o) => o.value && !NO_PLACEHOLDER.test(o.text.trim()));
      if (!opts.length) continue;
      // "Yes / willing to relocate" wins first; for location pickers, whatever
      // location the job lists is fine (opts[0] is the job's own location) —
      // never leave a location/relocation dropdown unanswered.
      const pick =
        opts.find((o) => YES.test(o.text)) ||
        opts.find((o) => CV.location && o.text.toLowerCase().includes(CV.location.split(',')[0].trim().toLowerCase())) ||
        opts[0];
      setValue(sel, pick.value);
      log(`  ☑ selected "${pick.text.trim()}" for "${labelTextOf(sel).slice(0, 50)}"`);
    }

    const radioGroups = {};
    for (const r of [...scope.querySelectorAll('input[type="radio"]')].filter(visible)) {
      (radioGroups[r.name || labelTextOf(r)] ||= []).push(r);
    }
    for (const group of Object.values(radioGroups)) {
      const groupCtx = (group[0].closest('fieldset')?.textContent || group.map((r) => labelTextOf(r)).join(' ')).slice(0, 200);
      let pick = null;
      // work-authorization radios: a blind "Yes" would claim e.g. US work rights the CV
      // doesn't have — only answer for India, otherwise skip the job rather than lie
      if (/authori[sz]ed to work|work authori[sz]ation|sponsor|visa|citizen|right to work/i.test(groupCtx) && !/india/i.test(groupCtx)) {
        log(`  🚫 work-authorization question outside India — skipping job: "${groupCtx.slice(0, 60)}"`);
        findButtonByText(scope, /close|cancel|×/i)?.click();
        scope.querySelector('[aria-label="Close"]')?.click();
        return false;
      }
      if (/gender|^sex\b/i.test(groupCtx)) {
        const g = (CV.gender || '').trim().toLowerCase();
        pick = (g && group.find((r) => labelTextOf(r).trim().toLowerCase() === g)) ||
               group.find((r) => /prefer not|decline|rather not/i.test(labelTextOf(r)));
        if (!pick) continue; // never guess a gender
      } else if (/disability|disabled/i.test(groupCtx)) {
        pick = group.find((r) => /no disability|not disabled|^no\b|none/i.test(labelTextOf(r)));
      }
      pick = pick || group.find((r) => YES.test(labelTextOf(r))) || group[0];
      if (!pick.checked) pick.click();
      log(`  ☑ radio "${labelTextOf(pick).slice(0, 50)}"`);
    }

    for (const cb of [...scope.querySelectorAll('input[type="checkbox"]')].filter(visible)) {
      const own = labelTextOf(cb);
      // Question text around the checkbox group (fieldset legend or nearby container)
      const groupText = (cb.closest('fieldset')?.querySelector('legend')?.textContent ||
                         cb.closest('fieldset, [role="group"]')?.textContent || '').trim();
      const isLocationQuestion = /relocat|locat|city|office|work from|based in|move to/i.test(groupText);
      // Tick if: it's an agree/authorize/relocate box, OR it belongs to a location
      // question — any city the job lists is fine, I'll relocate there.
      // Still never blind-check unrelated boxes (newsletters etc.).
      if (!cb.checked &&
          (isLocationQuestion || /relocat|agree|confirm|authoriz|terms|acknowledge|remote/i.test(own))) {
        cb.click();
        log(`  ☑ checked "${own.slice(0, 50)}"`);
      }
    }

    // 4. Send — poll for it, the modal sometimes renders the button late
    const sendBtn = await waitFor(() =>
      [...scope.querySelectorAll('form [type="submit"]')].find(visible) || findButtonByText(scope, SELECTORS.sendButtonText), 12000);
    if (!sendBtn) {
      // tell "button exists but disabled" (blocked application) apart from "selector miss"
      const disabledBtn = [...scope.querySelectorAll('button, [type="submit"]')]
        .find((b) => SELECTORS.sendButtonText.test(b.textContent.trim()) && b.disabled);
      log(disabledBtn
        ? '  🚫 Send button is disabled (application blocked) — skipping'
        : '  ⚠ no Send button found after waiting — skipping');
      findButtonByText(scope, /close|cancel|×/i)?.click();
      scope.querySelector('[aria-label="Close"]')?.click();
      return false;
    }
    if (CONFIG.DRY_RUN) {
      log('  🔍 DRY_RUN — would click:', sendBtn.textContent.trim());
      // close the modal so the loop can continue
      findButtonByText(scope, /close|cancel|×/i)?.click();
      scope.querySelector('[aria-label="Close"]')?.click();
      return true;
    }
    const form = sendBtn.closest('form');
    sendBtn.click();
    // count it only when Wellfound reacts: the form goes away or the button flips to "Applied".
    // A form still sitting there = validation error or a no-op click → not sent.
    const confirmed = await waitFor(() =>
      (form && !form.isConnected) || !sendBtn.isConnected || /applied|sent|submitted/i.test(sendBtn.textContent) ||
      /application (sent|submitted)|you(?:'|’)ve applied|applied on/i.test(found.dialog.innerText), 15000);
    if (!confirmed) {
      log('  ⚠ clicked Apply but Wellfound did not confirm — not counting');
      return false;
    }
    log('  ✅ application sent');
    return true;
  }

  // ======================= MAIN LOOP =======================
  // skip jobs whose listed INR range tops out below the bottom of EXPECTED_CTC ("6-10" → 6 LPA)
  const MIN_LPA = parseFloat(CV.expectedCTC) || 0;
  const payOk = (j) => !(MIN_LPA && j.maxLpa != null && j.maxLpa < MIN_LPA);

  const titleOk = (t) => {
    const lower = t.toLowerCase();
    // titles that state their own bar: "7+ Years", "3-5 yrs", "Equity Only", "unpaid"
    const yrs = lower.match(/(\d+)\s*\+?\s*(?:-\s*\d+\s*)?(?:years?|yrs?)\b/);
    if (yrs && +yrs[1] >= 2) return false;
    if (/equity[- ]only|unpaid|no salary/.test(lower)) return false;
    return CONFIG.TITLE_KEYWORDS.some((k) => lower.includes(k)) &&
           !CONFIG.TITLE_BLOCKLIST.some((k) => lower.includes(k));
  };

  // 2026 UI: job cards no longer carry an Apply button. Clicking the job link opens
  // an SPA overlay (URL gains ?job_listing_slug=…) with the "Apply to <Company>"
  // panel — a client-side route change, so this pasted script keeps running.
  function findJobRows() {
    const rows = [];
    for (const a of document.querySelectorAll('a[href*="/jobs/"]')) {
      // real job links look like /jobs/4491644-some-slug (nav "Jobs" link has no id)
      if (!/\/jobs\/\d/.test(a.getAttribute('href') || '')) continue;
      if (!visible(a) || a.textContent.trim().length < 4) continue;
      let row = a.closest('div');
      for (let i = 0; i < 5 && row && row.textContent.trim().length < 60; i++) row = row.parentElement;
      row = row || a.parentElement;
      // already applied? the card shows an "Applied" stamp
      if (SELECTORS.alreadyApplied.test([...row.querySelectorAll('button, span')].map((e) => e.textContent.trim()).find((t) => /^applied$/i.test(t)) || '')) continue;
      // only fresh jobs: skip anything posted more than 14 days ago (cards without a
      // "posted X ago" stamp are kept — wellfound delists stale jobs anyway)
      const posted = row.textContent.match(/posted (?:about )?(\d+)\+? ?(day|week|month)s? ago/i);
      if (posted) {
        const n = +posted[1];
        const unit = posted[2].toLowerCase();
        const days = unit === 'day' ? n : unit === 'week' ? n * 7 : n * 30;
        if (days > 14) continue;
      }
      const company = (row.querySelector('img[alt*="logo" i]')?.alt || '')
        .replace(/company logo/i, '').trim();
      const salary = (row.textContent.match(/(?:₹|\$|€)\s?[\d.,k]+\s?(?:[–-]\s?(?:₹|\$|€)?\s?[\d.,k]+)?k?/i) || [''])[0].trim();
      // top of an INR range in lakhs ("₹4L – ₹6L" → 6); null when not listed in INR
      const inr = row.textContent.match(/₹\s?([\d.]+)\s?L(?:\s?[–-]\s?₹\s?([\d.]+)\s?L)?/i);
      const maxLpa = inr ? +(inr[2] || inr[1]) : null;
      rows.push({ href: a.href, title: cleanTitle(a.textContent), company, salary, maxLpa, linkEl: a });
    }
    return rows;
  }

  // When the current page runs out of matching jobs, hop to these Wellfound
  // search pages (remote + all-location role pages). Navigation uses Wellfound's
  // own Next.js router (window.next.router) — a client-side route change, so
  // this pasted script KEEPS RUNNING across pages. A bad/404 slug just yields
  // zero jobs and we move on to the next one.
  // /role/* pages render empty for logged-in sessions (verified Jul 2026) — the
  // /jobs feed with infinite scroll is the real inventory. /location/india as backup.
  // '/location/india' removed: job clicks there are FULL navigations (no SPA
  // overlay) — the script dies, gets re-injected each page, and phantom-applied
  // to the same jobs in a loop (2026-08-06). /jobs infinite scroll only.
  const SEARCH_PAGES = ['/jobs'];
  // after a full page load onto one of the search pages, resume from the NEXT one —
  // restarting at 0 would reload the same page forever
  let searchIdx = SEARCH_PAGES.indexOf(location.pathname) + 1;

  async function goToNextSearchPage() {
    if (searchIdx >= SEARCH_PAGES.length) return false;
    const url = SEARCH_PAGES[searchIdx++];
    log(`🌐 Moving to next search page: ${url}`);
    if (window.next?.router?.push) {
      window.next.router.push(url);
    } else {
      log('⚠ SPA router not found — doing a full page load. PASTE THE SCRIPT AGAIN after the page loads to continue.');
      location.href = url;
      return false; // script dies on full reload; user re-pastes
    }
    await sleep(6000); // let the new results render
    window.scrollTo(0, 400);
    return true;
  }

  let applied = 0;
  const seen = new Set();

  log(`Starting. DRY_RUN=${CONFIG.DRY_RUN}, max=${CONFIG.MAX_APPLICATIONS}`);
  log('Tip: keep this tab focused and do not navigate away.');
  await sleep(5000); // job cards render after load — don't declare the page empty too early

  while (applied < CONFIG.MAX_APPLICATIONS) {
    const allRows = findJobRows();
    const jobs = allRows.filter((j) => !seen.has(j.href) && titleOk(j.title) && payOk(j));

    if (!jobs.length) {
      // Diagnostics so failures are debuggable from the console output
      log(`(this page: ${allRows.length} job cards found, 0 match filters` +
          (allRows.length ? ` — sample titles: ${allRows.slice(0, 3).map((j) => `"${j.title}"`).join(', ')}` : '') + ')');

      // Try to load more results on this page first
      const more = findButtonByText(document, /load more|show more/i); // "next" is too generic — could hit a form's Next button
      if (more) { more.click(); await sleep(3000); continue; }
      // infinite-scroll feed: keep scrolling — new cards load in batches
      const cardCount = () => [...document.querySelectorAll('a[href*="/jobs/"]')].filter((a) => /\/jobs\/\d/.test(a.getAttribute('href') || '')).length;
      const cardsBefore = cardCount();
      let grew = false;
      for (let s = 0; s < 6 && !grew; s++) {
        window.scrollTo(0, document.body.scrollHeight);
        await sleep(3000);
        grew = findJobRows().some((j) => !seen.has(j.href) && titleOk(j.title) && payOk(j));
      }
      if (grew) continue;
      // feed still delivering cards (just none matching yet) → keep going; only stop once it stops growing
      if (cardCount() > cardsBefore) continue;

      // Page exhausted → search globally across role pages
      if (await goToNextSearchPage()) continue;
      log('All search pages exhausted. Done.');
      break;
    }

    const job = jobs[0];
    seen.add(job.href);
    log(`▶ Applying: ${job.title} @ ${job.company || '?'} | ${job.href} | ${job.salary || ''}`);
    job.linkEl.scrollIntoView({ block: 'center' });
    await sleep(500);
    job.linkEl.click(); // SPA overlay opens with the "Apply to <Company>" panel
    await sleep(3000);

    const ok = await fillAndSubmit(job.company || getCompany(), job.title);
    if (ok) {
      applied++;
      log(`  progress: ${applied}/${CONFIG.MAX_APPLICATIONS}`);
    }
    // close the job overlay (top-right ✕) so the next card is clickable
    await sleep(1000);
    (document.querySelector('button[aria-label="Close" i], [class*="Modal" i] button[class*="close" i]') ||
      findButtonByText(document, /^×$|^✕$/))?.click();
    await sleep(1000);
    // full human pace only after a real send; a skipped job (already applied, blocked) just needs a short beat
    if (ok) await humanDelay(); else await sleep(5000 + Math.random() * 7000);
  }

  log(`Finished. ${CONFIG.DRY_RUN ? 'DRY RUN — nothing was actually sent. Set CONFIG.DRY_RUN = false and re-run to apply for real.' : `Applied to ${applied} jobs.`}`);
})();
