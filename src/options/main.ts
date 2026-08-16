import type {
  CandidateProfile,
  CoverLetterTone,
  EducationEntry,
  ExperienceEntry,
  LanguageEntry,
} from '../shared/types'
import { DEFAULT_PROFILE } from '../shared/types'
import { runtimeSendMessage } from '../shared/messaging'
import { parseResumeLocally } from '../shared/resumeExtract'
import {
  LANGUAGE_LEVELS,
  hydrateProfileLists,
  parseEducation,
  parseExperience,
  parseLanguages,
  parseSkills,
  syncProfileListStrings,
} from '../shared/profileLists'
import {
  AVAILABILITY_OPTIONS,
  EMPLOYMENT_TYPE_OPTIONS,
  HOME_OFFICE_OPTIONS,
  NOTICE_PERIOD_OPTIONS,
  REFERRAL_OPTIONS,
  REMOTE_EXPERIENCE_OPTIONS,
  WORK_ARRANGEMENT_OPTIONS,
  WORK_AUTHORIZATION_OPTIONS,
  YES_NO_OPTIONS,
  canonicalizePreference,
  formatPreferredSalary,
  parsePreferredSalary,
} from '../shared/preferenceValues'
import { extractTextFromFile } from './resumeImport'
import {
  clearStoredCv,
  fileToStoredCv,
  formatCvSize,
  loadCvMeta,
  saveStoredCv,
} from '../shared/cvStorage'
import type { CvFileMeta } from '../shared/cvTypes'

const form = document.getElementById('profile-form') as HTMLFormElement
const statusEl = document.getElementById('save-status') as HTMLParagraphElement
const importStatus = document.getElementById('import-status') as HTMLParagraphElement
const resumeInput = document.getElementById('resume-file') as HTMLInputElement
const cvChip = document.getElementById('cv-chip') as HTMLDivElement
const cvName = document.getElementById('cv-name') as HTMLElement
const cvMeta = document.getElementById('cv-meta') as HTMLElement
const clearCvBtn = document.getElementById('clear-cv') as HTMLButtonElement

const skillsTags = document.getElementById('skills-tags') as HTMLDivElement
const skillsInput = document.getElementById('skills-input') as HTMLInputElement
const languagesList = document.getElementById('languages-list') as HTMLDivElement
const educationList = document.getElementById('education-list') as HTMLDivElement
const experienceList = document.getElementById('experience-list') as HTMLDivElement

const scalarFields: Array<keyof CandidateProfile> = [
  'fullName',
  'email',
  'phone',
  'country',
  'city',
  'location',
  'linkedin',
  'github',
  'portfolio',
  'twitter',
  'telegram',
  'currentTitle',
  'currentCompany',
  'yearsExperience',
  'bio',
  'salaryAmount',
  'salaryCurrency',
  'salaryPeriod',
  'noticePeriod',
  'workArrangement',
  'employmentType',
  'availability',
  'timezone',
  'remoteExperience',
  'workAuthorization',
  'taxResidencyMatches',
  'willingToRelocate',
  'selfEmployed',
  'homeOffice',
  'asyncExperience',
  'referralSource',
  'coverLetterTone',
  'geminiApiKey',
]

let skills: string[] = []
let languages: LanguageEntry[] = []
let education: EducationEntry[] = []
let experience: ExperienceEntry[] = []

function emptyLanguage(): LanguageEntry {
  return { name: '', level: '' }
}

function emptyEducation(): EducationEntry {
  return { school: '', degree: '', years: '' }
}

function emptyExperience(): ExperienceEntry {
  return { title: '', company: '', start: '', end: '', description: '' }
}

function renderSkills() {
  skillsTags.innerHTML = ''
  for (const [i, skill] of skills.entries()) {
    const chip = document.createElement('span')
    chip.className = 'tag'
    chip.textContent = skill
    const remove = document.createElement('button')
    remove.type = 'button'
    remove.setAttribute('aria-label', `Remove ${skill}`)
    remove.textContent = '×'
    remove.addEventListener('click', () => {
      skills.splice(i, 1)
      renderSkills()
    })
    chip.appendChild(remove)
    skillsTags.appendChild(chip)
  }
}

function addSkill(raw: string) {
  const parts = raw.split(/[,;]+/).map((s) => s.trim()).filter(Boolean)
  for (const part of parts) {
    if (!skills.some((s) => s.toLowerCase() === part.toLowerCase())) {
      skills.push(part)
    }
  }
  renderSkills()
}

function renderLanguages() {
  languagesList.innerHTML = ''
  if (languages.length === 0) {
    const hint = document.createElement('p')
    hint.className = 'empty-hint'
    hint.textContent = 'No languages yet'
    languagesList.appendChild(hint)
    return
  }

  for (const [i, entry] of languages.entries()) {
    const row = document.createElement('div')
    row.className = 'row'

    const nameLabel = document.createElement('label')
    nameLabel.textContent = 'Language'
    const nameInput = document.createElement('input')
    nameInput.value = entry.name
    nameInput.placeholder = 'English'
    nameInput.addEventListener('input', () => {
      languages[i] = { ...languages[i], name: nameInput.value }
    })
    nameLabel.appendChild(nameInput)

    const levelLabel = document.createElement('label')
    levelLabel.textContent = 'Level'
    const levelSelect = document.createElement('select')
    const blank = document.createElement('option')
    blank.value = ''
    blank.textContent = '—'
    levelSelect.appendChild(blank)
    for (const level of LANGUAGE_LEVELS) {
      const opt = document.createElement('option')
      opt.value = level
      opt.textContent = level
      if (entry.level === level) opt.selected = true
      levelSelect.appendChild(opt)
    }
    if (entry.level && !(LANGUAGE_LEVELS as readonly string[]).includes(entry.level)) {
      const custom = document.createElement('option')
      custom.value = entry.level
      custom.textContent = entry.level
      custom.selected = true
      levelSelect.appendChild(custom)
    }
    levelSelect.addEventListener('change', () => {
      languages[i] = { ...languages[i], level: levelSelect.value }
    })
    levelLabel.appendChild(levelSelect)

    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'icon-btn'
    remove.setAttribute('aria-label', 'Remove language')
    remove.textContent = '×'
    remove.addEventListener('click', () => {
      languages.splice(i, 1)
      renderLanguages()
    })

    row.append(nameLabel, levelLabel, remove)
    languagesList.appendChild(row)
  }
}

function renderEducation() {
  educationList.innerHTML = ''
  if (education.length === 0) {
    const hint = document.createElement('p')
    hint.className = 'empty-hint'
    hint.textContent = 'No education entries yet'
    educationList.appendChild(hint)
    return
  }

  for (const [i, entry] of education.entries()) {
    const card = document.createElement('div')
    card.className = 'card'

    const degreeLabel = document.createElement('label')
    degreeLabel.textContent = 'Degree / program'
    const degreeInput = document.createElement('input')
    degreeInput.value = entry.degree
    degreeInput.placeholder = 'BSc Computer Science'
    degreeInput.addEventListener('input', () => {
      education[i] = { ...education[i], degree: degreeInput.value }
    })
    degreeLabel.appendChild(degreeInput)

    const schoolLabel = document.createElement('label')
    schoolLabel.textContent = 'School'
    const schoolInput = document.createElement('input')
    schoolInput.value = entry.school
    schoolInput.placeholder = 'University name'
    schoolInput.addEventListener('input', () => {
      education[i] = { ...education[i], school: schoolInput.value }
    })
    schoolLabel.appendChild(schoolInput)

    const yearsLabel = document.createElement('label')
    yearsLabel.className = 'full'
    yearsLabel.textContent = 'Years'
    const yearsInput = document.createElement('input')
    yearsInput.value = entry.years
    yearsInput.placeholder = '2018 – 2022'
    yearsInput.addEventListener('input', () => {
      education[i] = { ...education[i], years: yearsInput.value }
    })
    yearsLabel.appendChild(yearsInput)

    const actions = document.createElement('div')
    actions.className = 'card-actions'
    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'ghost'
    remove.textContent = 'Remove'
    remove.addEventListener('click', () => {
      education.splice(i, 1)
      renderEducation()
    })
    actions.appendChild(remove)

    card.append(degreeLabel, schoolLabel, yearsLabel, actions)
    educationList.appendChild(card)
  }
}

function renderExperience() {
  experienceList.innerHTML = ''
  if (experience.length === 0) {
    const hint = document.createElement('p')
    hint.className = 'empty-hint'
    hint.textContent = 'No roles yet — add from resume import or manually'
    experienceList.appendChild(hint)
    return
  }

  for (const [i, entry] of experience.entries()) {
    const card = document.createElement('div')
    card.className = 'card'

    const titleLabel = document.createElement('label')
    titleLabel.textContent = 'Title'
    const titleInput = document.createElement('input')
    titleInput.value = entry.title
    titleInput.placeholder = 'Frontend Engineer'
    titleInput.addEventListener('input', () => {
      experience[i] = { ...experience[i], title: titleInput.value }
    })
    titleLabel.appendChild(titleInput)

    const companyLabel = document.createElement('label')
    companyLabel.textContent = 'Company'
    const companyInput = document.createElement('input')
    companyInput.value = entry.company
    companyInput.placeholder = 'Acme Inc.'
    companyInput.addEventListener('input', () => {
      experience[i] = { ...experience[i], company: companyInput.value }
    })
    companyLabel.appendChild(companyInput)

    const startLabel = document.createElement('label')
    startLabel.textContent = 'Start'
    const startInput = document.createElement('input')
    startInput.value = entry.start
    startInput.placeholder = 'Jan 2022'
    startInput.addEventListener('input', () => {
      experience[i] = { ...experience[i], start: startInput.value }
    })
    startLabel.appendChild(startInput)

    const endLabel = document.createElement('label')
    endLabel.textContent = 'End'
    const endInput = document.createElement('input')
    endInput.value = entry.end
    endInput.placeholder = 'Present'
    endInput.addEventListener('input', () => {
      experience[i] = { ...experience[i], end: endInput.value }
    })
    endLabel.appendChild(endInput)

    const descLabel = document.createElement('label')
    descLabel.className = 'full'
    descLabel.textContent = 'Highlights'
    const descInput = document.createElement('textarea')
    descInput.rows = 4
    descInput.value = entry.description
    descInput.placeholder = 'What you built, owned, shipped…'
    descInput.addEventListener('input', () => {
      experience[i] = { ...experience[i], description: descInput.value }
    })
    descLabel.appendChild(descInput)

    const actions = document.createElement('div')
    actions.className = 'card-actions'
    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'ghost'
    remove.textContent = 'Remove'
    remove.addEventListener('click', () => {
      experience.splice(i, 1)
      renderExperience()
    })
    actions.appendChild(remove)

    card.append(titleLabel, companyLabel, startLabel, endLabel, descLabel, actions)
    experienceList.appendChild(card)
  }
}

const salaryPreview = document.getElementById('salary-preview') as HTMLSpanElement | null

function syncSalaryPreview() {
  if (!salaryPreview) return
  const formatted = formatPreferredSalary({
    salaryAmount:
      (document.getElementById('salaryAmount') as HTMLInputElement | null)?.value ?? '',
    salaryCurrency:
      (document.getElementById('salaryCurrency') as HTMLSelectElement | null)?.value ?? 'USD',
    salaryPeriod:
      (document.getElementById('salaryPeriod') as HTMLSelectElement | null)?.value ?? 'month',
  })
  salaryPreview.textContent = formatted ? `Fills as: ${formatted}` : ''
}

function readScalars(): CandidateProfile {
  const profile = { ...DEFAULT_PROFILE }
  for (const key of scalarFields) {
    const el = document.getElementById(key) as
      | HTMLInputElement
      | HTMLTextAreaElement
      | HTMLSelectElement
      | null
    if (!el) continue
    if (key === 'coverLetterTone') {
      profile.coverLetterTone = el.value as CoverLetterTone
    } else if (typeof profile[key] === 'string') {
      ;(profile[key] as string) = el.value
    }
  }
  profile.preferredSalary = formatPreferredSalary({
    salaryAmount: profile.salaryAmount,
    salaryCurrency: profile.salaryCurrency,
    salaryPeriod: profile.salaryPeriod,
  })
  return profile
}

function writeScalars(profile: CandidateProfile) {
  let salaryAmount = profile.salaryAmount
  let salaryCurrency = profile.salaryCurrency || 'USD'
  let salaryPeriod = profile.salaryPeriod || 'month'

  if (!salaryAmount && profile.preferredSalary) {
    const parsed = parsePreferredSalary(profile.preferredSalary)
    salaryAmount = parsed.salaryAmount
    salaryCurrency = parsed.salaryCurrency
    salaryPeriod = parsed.salaryPeriod
  }

  const normalized: CandidateProfile = {
    ...profile,
    salaryAmount,
    salaryCurrency,
    salaryPeriod,
    preferredSalary: formatPreferredSalary({
      salaryAmount,
      salaryCurrency,
      salaryPeriod,
    }),
    noticePeriod: canonicalizePreference(NOTICE_PERIOD_OPTIONS, profile.noticePeriod),
    workArrangement: canonicalizePreference(
      WORK_ARRANGEMENT_OPTIONS,
      profile.workArrangement,
    ),
    employmentType: canonicalizePreference(
      EMPLOYMENT_TYPE_OPTIONS,
      profile.employmentType,
    ),
    availability: canonicalizePreference(AVAILABILITY_OPTIONS, profile.availability),
    remoteExperience: canonicalizePreference(
      REMOTE_EXPERIENCE_OPTIONS,
      profile.remoteExperience,
    ),
    workAuthorization: canonicalizePreference(
      WORK_AUTHORIZATION_OPTIONS,
      profile.workAuthorization,
    ),
    taxResidencyMatches: canonicalizePreference(
      YES_NO_OPTIONS,
      profile.taxResidencyMatches || 'Yes',
    ),
    willingToRelocate: canonicalizePreference(YES_NO_OPTIONS, profile.willingToRelocate),
    selfEmployed: canonicalizePreference(YES_NO_OPTIONS, profile.selfEmployed),
    homeOffice: canonicalizePreference(HOME_OFFICE_OPTIONS, profile.homeOffice),
    asyncExperience: canonicalizePreference(YES_NO_OPTIONS, profile.asyncExperience),
    referralSource: canonicalizePreference(REFERRAL_OPTIONS, profile.referralSource),
  }

  for (const key of scalarFields) {
    const el = document.getElementById(key) as
      | HTMLInputElement
      | HTMLTextAreaElement
      | HTMLSelectElement
      | null
    if (!el) continue
    const value = (normalized[key] as string) ?? ''
    el.value = value
    if (el instanceof HTMLSelectElement && value && el.value !== value) {
      const opt = document.createElement('option')
      opt.value = value
      opt.textContent = value
      opt.selected = true
      el.appendChild(opt)
    }
  }
  syncSalaryPreview()
}

function applyLists(profile: CandidateProfile) {
  skills = [...(profile.skillsList ?? [])]
  languages = profile.languagesList.map((l) => ({ ...l }))
  education = profile.educationList.map((e) => ({ ...e }))
  experience = profile.experienceList.map((e) => ({ ...e }))
  renderSkills()
  renderLanguages()
  renderEducation()
  renderExperience()
}

function readForm(): CandidateProfile {
  return syncProfileListStrings({
    ...DEFAULT_PROFILE,
    ...readScalars(),
    skillsList: [...skills],
    languagesList: languages.map((l) => ({ ...l })),
    educationList: education.map((e) => ({ ...e })),
    experienceList: experience.map((e) => ({ ...e })),
  })
}

function writeForm(profile: CandidateProfile) {
  const hydrated = hydrateProfileLists(profile)
  writeScalars(hydrated)
  applyLists(hydrated)
}

function setImportStatus(text: string, error = false) {
  importStatus.textContent = text
  importStatus.className = error ? 'status error' : 'status'
}

function renderCvChip(meta: CvFileMeta | null) {
  if (!meta) {
    cvChip.hidden = true
    cvName.textContent = '—'
    cvMeta.textContent = ''
    return
  }
  cvChip.hidden = false
  cvName.textContent = meta.name
  cvMeta.textContent = `${formatCvSize(meta.size)} · ready to auto-attach`
}

async function loadCvChip() {
  const meta = await loadCvMeta()
  renderCvChip(meta)
}

let storedProfile: CandidateProfile = { ...DEFAULT_PROFILE }

async function load() {
  const res = await runtimeSendMessage<{
    ok: boolean
    profile: CandidateProfile
  }>({ type: 'GET_PROFILE' })
  storedProfile = hydrateProfileLists({
    ...DEFAULT_PROFILE,
    ...(res.profile ?? {}),
  })
  writeForm(storedProfile)
  await loadCvChip()
}

skillsInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault()
    addSkill(skillsInput.value)
    skillsInput.value = ''
  } else if (e.key === 'Backspace' && !skillsInput.value && skills.length > 0) {
    skills.pop()
    renderSkills()
  }
})

skillsInput.addEventListener('blur', () => {
  if (!skillsInput.value.trim()) return
  addSkill(skillsInput.value)
  skillsInput.value = ''
})

document.getElementById('add-language')?.addEventListener('click', () => {
  languages.push(emptyLanguage())
  renderLanguages()
})

document.getElementById('add-education')?.addEventListener('click', () => {
  education.push(emptyEducation())
  renderEducation()
})

document.getElementById('add-experience')?.addEventListener('click', () => {
  experience.push(emptyExperience())
  renderExperience()
})

for (const id of ['salaryAmount', 'salaryCurrency', 'salaryPeriod'] as const) {
  document.getElementById(id)?.addEventListener('input', syncSalaryPreview)
  document.getElementById(id)?.addEventListener('change', syncSalaryPreview)
}

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  const profile = readForm()
  storedProfile = profile
  await runtimeSendMessage({ type: 'SAVE_PROFILE', profile })
  statusEl.textContent = 'Saved.'
  setTimeout(() => {
    statusEl.textContent = ''
  }, 2000)
})

resumeInput.addEventListener('change', async () => {
  const file = resumeInput.files?.[0]
  if (!file) return

  const current = readForm()
  setImportStatus(`Reading ${file.name}…`)
  try {
    const storedCv = await fileToStoredCv(file)
    await saveStoredCv(storedCv)
    renderCvChip({
      name: storedCv.name,
      mimeType: storedCv.mimeType,
      size: storedCv.size,
      updatedAt: storedCv.updatedAt,
    })

    const resumeText = await extractTextFromFile(file)
    const parsed = parseResumeLocally(resumeText)

    const stringEntries = Object.fromEntries(
      Object.entries(parsed).filter(([, v]) => typeof v === 'string' && v.trim().length > 0),
    ) as Partial<CandidateProfile>

    const merged: CandidateProfile = hydrateProfileLists({
      ...current,
      ...stringEntries,
      skillsList: stringEntries.skills
        ? parseSkills(stringEntries.skills)
        : current.skillsList,
      languagesList: stringEntries.languages
        ? parseLanguages(stringEntries.languages)
        : current.languagesList,
      educationList: stringEntries.education
        ? parseEducation(stringEntries.education)
        : current.educationList,
      experienceList:
        Array.isArray(parsed.experienceList) && parsed.experienceList.length > 0
          ? parsed.experienceList
          : stringEntries.workExperience
            ? parseExperience(stringEntries.workExperience)
            : current.experienceList,
      geminiApiKey: current.geminiApiKey || storedProfile.geminiApiKey,
      coverLetterTone: current.coverLetterTone,
    })

    writeForm(merged)
    setImportStatus(
      `Saved ${file.name} for auto-attach + filled profile. Review and click Save.`,
    )
  } catch (err) {
    setImportStatus(err instanceof Error ? err.message : 'Import failed', true)
  } finally {
    resumeInput.value = ''
  }
})

clearCvBtn.addEventListener('click', async () => {
  await clearStoredCv()
  renderCvChip(null)
  setImportStatus('CV removed. Import again to auto-attach on Fill.')
})

function setupSectionNav() {
  const nav = document.querySelector('.nav')
  if (!(nav instanceof HTMLElement)) return

  const links = [...nav.querySelectorAll('a[href^="#"]')].filter(
    (el): el is HTMLAnchorElement => el instanceof HTMLAnchorElement,
  )
  const sections = links
    .map((link) => document.getElementById(link.hash.slice(1)))
    .filter((el): el is HTMLElement => el instanceof HTMLElement)

  if (!sections.length) return

  const setActive = (id: string) => {
    for (const link of links) {
      link.classList.toggle('is-active', link.hash === `#${id}`)
    }
  }

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
      const top = visible[0]
      if (top?.target instanceof HTMLElement && top.target.id) {
        setActive(top.target.id)
      }
    },
    {
      rootMargin: '-20% 0px -55% 0px',
      threshold: [0.15, 0.35, 0.55],
    },
  )

  for (const section of sections) observer.observe(section)
  setActive(sections[0].id)
}

setupSectionNav()
void load()
