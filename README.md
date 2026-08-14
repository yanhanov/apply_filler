# Apply Filler

Firefox (and Chrome/Edge) extension that fills job application forms from your saved profile, attaches your CV, and drafts cover letters / open answers with free Google Gemini.

## Features

- Local field matching via `id`, `name`, `placeholder`, `label`, `aria-label`, `autocomplete`
- Vacancy text scraped from the page for Gemini context
- Cover letter + open / custom questions via Gemini (optional API key)
- Known profile fields always fill locally (email, phone, salary prefs, …) — no AI overwrite
- Resume import (PDF/DOCX) + auto-attach on Fill
- Profile and API key stored in extension local storage (no backend)

## Setup

```bash
npm install
npm run build
```

### Firefox

1. `npm run build` (patches the manifest for Firefox)
2. Open `about:debugging#/runtime/this-firefox`
3. **Load Temporary Add-on…** → select `dist/manifest.json`
4. After each rebuild, click **Reload** on the add-on card

Needs Firefox **115+**. Temporary add-ons disappear when Firefox closes.

### Chrome / Edge

1. `npm run build:chrome` (keeps `background.service_worker`)
2. Open `chrome://extensions` → Developer mode → **Load unpacked** → `dist` folder

## Free Gemini API key

1. Open [Google AI Studio — API keys](https://aistudio.google.com/apikey)
2. Create an API key (free tier)
3. Open the extension **Options** page → paste the key under **Gemini**
4. Optionally **Import from resume** (PDF or DOCX) — parsed locally, no AI key needed
5. Open a job / apply page → click the extension icon → **Fill application**

Without a Gemini key, profile fields and CV still fill; cover letters fall back to Bio, and open questions are skipped.

## Notes

- The extension never auto-submits forms — always review before sending
- Restricted pages (`about:`, AMO, etc.) cannot be scripted — use a normal job site tab
- Free Gemini quota limits may return a clear warning in the popup; profile fields still fill

## Privacy

- Profile data stays in your browser
- The API key is read only in the extension background when calling Gemini
- Vacancy text and open-question labels are sent to Gemini only when a key is set and those fields exist
