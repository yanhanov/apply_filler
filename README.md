# Apply Filler

Firefox (and Chrome/Edge) extension that reads the job vacancy on the current page, fills application form fields from your profile, and drafts a cover letter with free Google Gemini.

## Features

- Universal form filling via `id`, `name`, `placeholder`, `label`, `aria-label`, `autocomplete`
- Vacancy text scraped from the page (`main` / `article` / longest content block)
- Cover letter + open questions via Gemini (your API key)
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
3. Open the extension **Options** page and paste the key
4. Optionally **Import from resume** (PDF or DOCX) — parsed locally, no AI key needed
5. Gemini key is only required when generating cover letters / open answers on apply pages
6. Open a job / apply page → click the extension icon → **Fill application**

## Notes

- The extension never auto-submits forms — always review before sending
- File uploads (CV/resume) are not filled automatically; you’ll see a reminder
- Restricted pages (`about:`, AMO, etc.) cannot be scripted — use a normal job site tab
- Free Gemini quota limits may return a clear error in the popup

## Privacy

- Profile data stays in your browser
- The API key is read only in the extension background when calling Gemini
- Vacancy text and relevant form labels are sent to Gemini to generate answers
