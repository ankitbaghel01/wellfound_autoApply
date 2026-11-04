# Wellfound Auto-Apply

Automatically applies to matching jobs on [Wellfound](https://wellfound.com) (ex-AngelList Talent).
A Playwright runner opens Chrome with your saved Wellfound session, injects the apply
script into the `/jobs` feed, and the script:

- scrolls the infinite feed and picks jobs whose **title matches your keywords** (and skips a blocklist),
- opens each job's "Apply to *Company*" panel,
- fills the **cover letter** (personalized per company/role from your `.env` data),
- answers extra questions from a built-in Q&A bank (optionally falls back to **Gemini** for unknown questions),
- handles location prompts ("I can relocate to…"), dropdowns, radios and checkboxes,
- submits, logs every application to `applications.csv`, and respects a **50/day cap**.

It starts in **DRY RUN** mode by default — it fills everything but never presses Send —
so you can watch it work before going live.

## Requirements

- Windows 10/11 (Task Scheduler used for automatic daily runs — manual runs work anywhere Node does)
- [Node.js](https://nodejs.org/) 18+
- Google Chrome
- A Wellfound account with your profile + resume completed

## Setup

**1. Clone and install:**

```powershell
git clone https://github.com/ankitbaghel01/wellfound_autoApply.git
cd wellfound_autoApply
npm install
```

**2. Create your `.env`:**

```powershell
copy .env.example .env
```

Open `.env` and fill in your details — name, contact, skills, highlights, salary
expectations, links, etc. Every application answer and cover letter is built from
these values; **nothing personal is hard-coded in the scripts**. `.env` is
git-ignored, so your data never gets pushed.

Optional: set `GEMINI_KEY` to a free Google Gemini API key — any application
question the built-in answer bank can't match gets answered by Gemini using your CV.

**3. Log in to Wellfound (one time, visible browser):**

```powershell
node auto-apply-runner.js wellfound login
```

A Chrome window opens — log in to wellfound.com, then close the window.
The session is saved to `.wellfound-chrome-profile/` and reused by every later run.

**4. Dry run (watch it, nothing is submitted):**

```powershell
node auto-apply-runner.js wellfound
```

Chrome opens on the jobs feed, and you'll see forms being filled. The log
(`auto-apply-wellfound.log`) shows lines like:

```
✍ cover letter filled
🔍 DRY_RUN — would click: Apply
==> 1/50 this run (1/50 today)
```

**5. Go live:**

```powershell
node auto-apply-runner.js wellfound --live
```

Same flow, but Send is actually clicked. An application only counts once Wellfound
confirms it (the form closes or the button flips to "Applied"). Each one is appended to
`applications.csv` (Date, Site, Role, Company, Salary, Skills, Job Link, JD) and
counted in `apply-state-wellfound.json` toward the daily cap. Wellfound holds new
applications as "Scheduled" for ~5 minutes — they can be undone from the Applied tab.

Runner flags:

| Flag | What it does |
|---|---|
| `--live` | Actually submit (default is dry run) |
| `--show` | Keep the Chrome window on-screen so you can watch (default runs off-screen) |
| `--max=N` | Stop after N applications this run — e.g. `--max=1` for a test send |

## Customizing which jobs it applies to

Edit the `CONFIG` block at the top of `wellfound-auto-apply.js`:

| Setting | What it does |
|---|---|
| `TITLE_KEYWORDS` | Apply only when the job title contains one of these (case-insensitive) |
| `TITLE_BLOCKLIST` | Skip when the title contains any of these (senior, manager, .net, …) |
| `MAX_APPLICATIONS` | Per-run cap (the runner overrides it with the daily cap remaining) |
| `MIN_DELAY_MS` / `MAX_DELAY_MS` | Wait between applications (default 60–150 s — human pace; going faster trips Wellfound's bot-check). Skipped jobs only wait 5–12 s |

Built-in filters (no config needed):

- **Eligibility** — jobs where Wellfound's apply panel warns you're *outside the years of
  experience preferred* are skipped, as are titles stating 2+ years, "equity only" or "unpaid".
- **Salary floor** — jobs whose listed INR range tops out below the low end of `EXPECTED_CTC`
  (e.g. `6-10` → 6 LPA) are skipped. Jobs with no listed salary are still applied to.
- **Work authorization** — radio questions about sponsorship/authorization outside India are
  never guessed; the job is skipped instead.
- **Stack answers** — "experience with React / backend / AI?" questions are answered from
  `ANSWER_FRONTEND`, `ANSWER_BACKEND` and `ANSWER_AI` in `.env`, so no skills are claimed
  that aren't yours.

**Locations:** the script applies to whatever your Wellfound search filters show on
`wellfound.com/jobs` — set your filters (remote / worldwide / a city) once in the
browser and it follows them. Jobs in other locations are still handled: when
Wellfound asks, it picks "I can relocate to…" and selects the job's offered location.
Jobs the company has location-blocked are detected and skipped. Jobs posted more than
14 days ago are skipped.

## Run it automatically every day (Task Scheduler)

```powershell
$repo = "C:\path\to\wellfound_autoApply"
$action  = New-ScheduledTaskAction -Execute "node.exe" -Argument "`"$repo\auto-apply-runner.js`" wellfound --live" -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -Daily -At 12:30
Register-ScheduledTask -TaskName "WellfoundAutoApply" -Action $action -Trigger $trigger -Settings (New-ScheduledTaskSettingsSet -StartWhenAvailable)
```

Useful commands:

```powershell
Start-ScheduledTask WellfoundAutoApply       # run now
Disable-ScheduledTask WellfoundAutoApply     # pause
Enable-ScheduledTask WellfoundAutoApply      # resume
Unregister-ScheduledTask WellfoundAutoApply  # remove
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| `0 job cards found` on every page | Wellfound is showing a DataDome "Verification Required" captcha. Run `node auto-apply-runner.js wellfound login`, solve the slider once manually, close the window, re-run. |
| Session logged out | Delete `.wellfound-chrome-profile/` and repeat the `login` step. |
| `no apply modal found — skipping` | That job opened as a full page instead of the apply panel — it's skipped safely and not counted. |
| `no Send button found` on many jobs in a row | Usually the bot-check again (see first row). Keep delays at 60 s+. |
| Want today's counter reset | Delete `apply-state-wellfound.json`. |

## Files

| File | Purpose |
|---|---|
| `auto-apply-runner.js` | Playwright wrapper: opens Chrome, injects the site script, logs to CSV, enforces the daily cap |
| `wellfound-auto-apply.js` | The Wellfound apply logic (also pasteable directly into the DevTools console) |
| `config.js` | Tiny no-dependency `.env` loader |
| `.env.example` | Template — copy to `.env` and fill in |
| `applications.csv` | Every submitted application (git-ignored) |
| `apply-state-wellfound.json` | Today's application count for the 50/day cap (git-ignored) |
| `auto-apply-wellfound.log` | Run history (git-ignored) |
| `.wellfound-chrome-profile/` | Saved Chrome session (git-ignored) |

## Disclaimer

Auto-applying may violate Wellfound's Terms of Service and can get an
account rate-limited or banned. The delays are deliberately human-like and everything
runs on your own machine with your own account — use at your own risk, and review
the dry run before going live.
