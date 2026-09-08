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
      'react', 'node', 'javascript', 'typescript', 'python', 'mobile',
      'react native', 'sde', 'member of technical staff',
      'engineer', 'developer', 'programmer',
    ],
    // Skip jobs whose title contains any of these
    TITLE_BLOCKLIST: [
      'senior', 'principal', 'director', 'manager', 'lead', 'devops',
      'data engineer', 'qa', 'test', 'intern', 'designer', 'sales', 'marketing',
      'teacher', 'trainer', 'tutor', 'instructor', 'coach',
      '.net', 'c#', 'php', 'ruby', 'golang', 'ios', 'android native', 'flutter',
    ],
    // Indian cities/locations to accept for on-site/hybrid jobs
    INDIA_LOCATIONS: [
      'bangalore', 'bengaluru', 'hyderabad', 'mumbai', 'pune', 'chennai',
      'delhi', 'noida', 'gurgaon', 'gurugram', 'kolkata', 'ahmedabad',
      'jaipur', 'lucknow', 'chandigarh', 'kochi', 'coimbatore', 'indore',
      'bhopal', 'nagpur', 'visakhapatnam', 'vijayawada', 'surat', 'rajkot',
      'india',
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
      `I'm ${CV.name}, ${CV.currentRole}. ${CV.highlights[0] || ''}. Previously: ${CV.highlights[2] || ''}. ${CV.highlights[3] || ''}.`],
    [/(biggest|proudest|favorite) (project|achievement|accomplishment)|worked on/i,
      `${CV.highlights[0] || ''}. I owned it end to end, from architecture through deployment and CI/CD.`],
    [/react|frontend|front-end/i,
      `Strong frontend experience: React.js, Next.js, Redux, TypeScript and Tailwind CSS, plus React Native for cross-platform mobile apps.`],
    [/node|backend|back-end|api/i,
      `I build production backends daily: Node.js/Express and Python/FastAPI, REST + GraphQL, WebSockets, MongoDB/PostgreSQL/Redis, on cloud with Docker and CI/CD.`],
    [/\b(ai|llm|ml|machine learning|genai|langchain)\b/i,
      `AI is a core focus: production GenAI agents, RAG pipelines, prompt engineering, tool calling, MCP and multi-agent systems.`],
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

${CV.highlights[1] || ''}${CV.highlights[2] ? ' ' + CV.highlights[2] + '.' : ''}

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
    el.dispatchEvent(new Event('blur', { bubbles: true }));
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
      .split(/remote only|on-?site|in office|hybrid|₹|\$\d|€|posted \d|recruiter|•|\d+\s?(?:weeks?|days?|months?|hours?)\s?ago/i)[0]
      .replace(/\(?\s*remote\s*\)?$/i, '')
      .replace(/\(.*?\)/g, '')  // strip parenthetical annotations like (Full-time/Intern/...)
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

  // --- Submission helpers ---

  // Dispatch realistic pointer/mouse events to simulate a genuine user click
  function simulateRealClick(el) {
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const props = {
      bubbles: true, cancelable: true, view: window,
      clientX: x, clientY: y, screenX: x, screenY: y,
      button: 0, buttons: 1, detail: 1,
    };
    el.dispatchEvent(new PointerEvent('pointerdown', { ...props, pointerId: 1, pointerType: 'mouse', width: 1, height: 1 }));
    el.dispatchEvent(new MouseEvent('mousedown', props));
    el.dispatchEvent(new PointerEvent('pointerup', { ...props, pointerId: 1, pointerType: 'mouse', width: 1, height: 1 }));
    el.dispatchEvent(new MouseEvent('mouseup', props));
    el.dispatchEvent(new MouseEvent('click', props));
  }

  // Inspect the apply panel for evidence that submission was accepted
  function checkSubmissionEvidence(scope) {
    if (!scope || !scope.isConnected) return 'panel_removed';
    if (scope.getClientRects().length === 0) return 'panel_hidden';
    const text = scope.textContent || '';
    if (/thank you|applied successfully|application submitted|received your application|successfully applied/i.test(text)) return 'success_text';
    const btns = [...scope.querySelectorAll('button')];
    for (const b of btns) {
      if (/^applied$|^submitted$|^done$|^sent$/i.test(b.textContent.trim())) return 'button_applied';
    }
    if (/error|invalid|required field|missing|cannot submit/i.test(text)) return 'validation_error';
    return null;
  }

  // Poll window[key] until it is set by the runner, then return and delete it
  async function waitForWindowValue(key, timeoutMs = 15000) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      try {
        const val = window[key];
        if (val !== undefined && val !== null) {
          delete window[key];
          return val;
        }
      } catch (e) { }
      await sleep(300);
    }
    return null;
  }

  // Intercept fetch to detect whether the submission API request was sent
  function setupNetworkMonitor() {
    const state = { requestDetected: false, responseStatus: null, requestUrl: '', error: null };
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
      try {
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
        const method = (args[1]?.method || 'GET').toUpperCase();
        if (/application|apply|submit/i.test(url) && /POST|PUT|PATCH/i.test(method)) {
          state.requestDetected = true;
          state.requestUrl = url;
          log(`  [net] ${method} ${url}`);
        }
        const resp = await originalFetch.apply(this, args);
        if (state.requestDetected && state.responseStatus === null) {
          state.responseStatus = resp.status;
          log(`  [net] Response: ${resp.status}`);
        }
        return resp;
      } catch (e) {
        if (state.requestDetected) {
          state.error = e.message;
          log(`  [net] Request failed: ${e.message}`);
        }
        throw e;
      }
    };
    return { state, restore: () => { window.fetch = originalFetch; } };
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
              contents: [{
                parts: [{
                  text:
                    `You are answering a job application question on my behalf. Answer in first person, 2-4 sentences, professional, no markdown.\n\nMy CV:\n${JSON.stringify(CV)}\n\nQuestion: ${questionText}`
                }]
              }],
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
    modal: '[role="dialog"], [class*="modal" i]',
    applyButtonText: /^apply$|apply now/i,
    // 2026 UI: the submit button in the "Apply to <Company>" panel is labeled "Apply"
    sendButtonText: /^apply$|^send$|submit|send application/i,
    alreadyApplied: /applied/i,
  };

  // ======================= APPLY TO ONE JOB (inside opened modal/pane) =======================
  async function fillAndSubmit(company, title) {
    // several overlays match the modal selector — pick the one that IS the apply
    // panel ("Apply to <Company>" + cover-letter textarea), not the page shell
    const modal = await waitFor(() => {
      const dialogs = [...document.querySelectorAll(SELECTORS.modal)];
      return dialogs.find((d) => /apply to /i.test(d.textContent) && d.querySelector('textarea')) ||
        dialogs.find((d) => /apply to /i.test(d.textContent)) || // panel with only radio/select questions, no cover-letter box
        dialogs.find((d) => d.querySelector('textarea'));
    });
    // No apply modal → we're on a bare job page (full navigation, e.g. from a
    // non-SPA search page). The page-level "Apply" button only OPENS the panel;
    // clicking it and counting a "send" was creating phantom applications. Bail.
    if (!modal) {
      log('  ⚠ no apply modal found — skipping (not counting as sent)');
      return false;
    }
    const scope = modal;

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
      log('  ✍ cover letter filled');
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
          // options render in a portal, so search the whole document
          const opt = await waitFor(
            () => [...document.querySelectorAll('[role="option"], [id*="option" i], [class*="option" i]')].find(visible),
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
      if (/gender|^sex\b/i.test(groupCtx)) {
        pick = group.find((r) => { const l = labelTextOf(r); return /male/i.test(l) && !/female/i.test(l); });
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

    // 4. Submit — find the final Apply/Send button, click it, verify submission
    log('  [debug] Searching for final submit button...');
    const sendBtn = await waitFor(() => {
      const buttons = [...scope.querySelectorAll('button, a[role="button"], [type="submit"]')];
      // Prefer "Send Application" / "Submit" (unambiguous submit labels)
      let btn = buttons.find(b => visible(b) && /send application|submit/i.test(b.textContent.trim()));
      if (btn) return btn;
      // Fall back to "Apply" — take the LAST visible one (submit is typically at the bottom of the panel)
      const applyBtns = buttons.filter(b => visible(b) && /^apply$/i.test(b.textContent.trim()));
      if (applyBtns.length) return applyBtns[applyBtns.length - 1];
      return null;
    }, 12000);

    if (!sendBtn) {
      const disabledBtn = [...scope.querySelectorAll('button, [type="submit"]')]
        .find((b) => /apply|send|submit/i.test(b.textContent.trim()) && b.disabled);
      if (disabledBtn) {
        log(`  🚫 Submit button found but DISABLED — skipping`);
        log(`  [debug] Button text: "${disabledBtn.textContent.trim()}"`);
      } else {
        log('  ⚠ no Submit button found after waiting — skipping');
      }
      findButtonByText(scope, /close|cancel|×/i)?.click();
      scope.querySelector('[aria-label="Close"]')?.click();
      return false;
    }

    // Diagnostic output
    const btnText = sendBtn.textContent.trim();
    const btnBBox = sendBtn.getBoundingClientRect();
    log(`  [debug] Final submit button found`);
    log(`  [debug] Button text: "${btnText}"`);
    log(`  [debug] Button tag: ${sendBtn.tagName}`);
    log(`  [debug] disabled: ${sendBtn.disabled}`);
    log(`  [debug] visible: ${visible(sendBtn)}`);
    log(`  [debug] bbox: ${JSON.stringify({ x: Math.round(btnBBox.x), y: Math.round(btnBBox.y), w: Math.round(btnBBox.width), h: Math.round(btnBBox.height) })}`);

    if (CONFIG.DRY_RUN) {
      log(`  🔍 DRY_RUN — would perform real browser click on: "${btnText}"`);
      log(`  [debug] Button enabled: ${!sendBtn.disabled}`);
      findButtonByText(scope, /close|cancel|×/i)?.click();
      scope.querySelector('[aria-label="Close"]')?.click();
      return true;
    }

    // --- LIVE SUBMISSION ---
    // Set up network monitoring before clicking
    const netMonitor = setupNetworkMonitor();

    // Attempt 1: Simulated click with realistic pointer/mouse events
    log('  [debug] Attempt 1: Simulated click...');
    simulateRealClick(sendBtn);

    // Wait for evidence that the application was accepted (up to 6 seconds)
    let evidence = await waitFor(() => checkSubmissionEvidence(scope), 6000, 500);

    if (evidence) {
      netMonitor.restore();
      log(`  ✅ APPLICATION_VERIFIED (${evidence})`);
      return true;
    }

    // If a network request was detected, check its status
    if (netMonitor.state.requestDetected) {
      const status = netMonitor.state.responseStatus;
      const err = netMonitor.state.error;
      netMonitor.restore();
      if (err) {
        log(`  ❌ APPLICATION_FAILED (network error: ${err})`);
        return false;
      }
      if (status >= 200 && status < 300) {
        log(`  ✅ APPLICATION_VERIFIED (API ${status})`);
        return true;
      } else if (status) {
        log(`  ❌ APPLICATION_FAILED (API returned ${status})`);
        return false;
      }
    }

    // Attempt 2: Request Playwright to perform a real browser-level click
    log('  [debug] Attempt 1 produced no evidence — requesting Playwright bridge click...');
    netMonitor.restore();
    sendBtn.setAttribute('data-wf-apply-submit', 'true');
    log('[wf-submit-ready] [data-wf-apply-submit]');

    // Wait for the runner to perform the click and signal back
    const bridgeResult = await waitForWindowValue('__wfSubmitResult', 20000);

    if (bridgeResult?.success) {
      log(`  ✅ APPLICATION_VERIFIED (${bridgeResult.evidence || 'playwright_click'})`);
      return true;
    }

    log(`  ❌ APPLICATION_FAILED (${bridgeResult?.reason || 'bridge_timeout'})`);
    findButtonByText(scope, /close|cancel|×/i)?.click();
    scope.querySelector('[aria-label="Close"]')?.click();
    return false;
  }

  // ======================= MAIN LOOP =======================
  const titleOk = (t) => {
    const lower = t.toLowerCase();
    return CONFIG.TITLE_KEYWORDS.some((k) => lower.includes(k)) &&
      !CONFIG.TITLE_BLOCKLIST.some((k) => lower.includes(k));
  };

  // Accept if remote OR based in India
  const locationOk = (loc) => {
    if (!loc) return true; // no location info → accept (will handle in apply form)
    const lower = loc.toLowerCase();
    if (/remote/i.test(lower)) return true;
    return CONFIG.INDIA_LOCATIONS.some((city) => lower.includes(city));
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
      // Extract location from card text (appears near title, before salary/posted info)
      const cardText = row.textContent || '';
      const locMatch = cardText.match(/(remote only|on-?site|in office|hybrid|[^·•\n]{2,40}(?:India|Bangalore|Bengaluru|Hyderabad|Mumbai|Pune|Chennai|Delhi|Noida|Gurgaon|Gurugram|Kolkata|Ahmedabad|Jaipur|Lucknow|Chandigarh|Kochi|Coimbatore|Indore|Bhopal|Nagpur|Visakhapatnam|Vijayawada|Surat|Rajkot)[^·•\n]{0,20})/i);
      const location = locMatch ? locMatch[1].trim() : '';
      rows.push({ href: a.href, title: cleanTitle(a.textContent), company, salary, location, linkEl: a });
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
    const jobs = allRows.filter((j) => !seen.has(j.href) && titleOk(j.title) && locationOk(j.location));

    if (!jobs.length) {
      // Diagnostics so failures are debuggable from the console output
      log(`(this page: ${allRows.length} job cards found, 0 match filters` +
        (allRows.length ? ` — sample: ${allRows.slice(0, 3).map((j) => `"${j.title}" [${j.location || 'no-loc'}]`).join(', ')}` : '') + ')');

      // Try to load more results on this page first
      const more = findButtonByText(document, /load more|show more/i); // "next" is too generic — could hit a form's Next button
      if (more) { more.click(); await sleep(3000); continue; }
      // infinite-scroll feed: keep scrolling — new cards load in batches
      let grew = false;
      for (let s = 0; s < 6 && !grew; s++) {
        window.scrollTo(0, document.body.scrollHeight);
        await sleep(3000);
        grew = findJobRows().some((j) => !seen.has(j.href) && titleOk(j.title) && locationOk(j.location));
      }
      if (grew) continue;

      // Page exhausted → search globally across role pages
      if (await goToNextSearchPage()) continue;
      log('All search pages exhausted. Done.');
      break;
    }

    const job = jobs[0];
    seen.add(job.href);
    log(`▶ Applying: ${job.title} @ ${job.company || '?'} | ${job.location || 'remote'} | ${job.href} | ${job.salary || ''}`);
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
    await humanDelay();
  }

  log(`Finished. ${CONFIG.DRY_RUN ? 'DRY RUN — nothing was actually sent. Set CONFIG.DRY_RUN = false and re-run to apply for real.' : `Applied to ${applied} jobs.`}`);
})();
