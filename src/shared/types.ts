export type CoverLetterTone = 'short' | 'professional' | 'enthusiastic'

export type FieldIntent =
  | 'full_name'
  | 'first_name'
  | 'last_name'
  | 'email'
  | 'phone'
  | 'country'
  | 'city'
  | 'location'
  | 'linkedin'
  | 'github'
  | 'portfolio'
  | 'twitter'
  | 'telegram'
  | 'current_title'
  | 'current_company'
  | 'years_experience'
  | 'skills'
  | 'work_experience'
  | 'education'
  | 'languages'
  | 'salary'
  | 'notice_period'
  | 'work_arrangement'
  | 'employment_type'
  | 'availability'
  | 'timezone'
  | 'remote_experience'
  | 'work_authorization'
  | 'tax_residency_match'
  | 'willing_to_relocate'
  | 'self_employed'
  | 'home_office'
  | 'async_experience'
  | 'referral_source'
  | 'cover_letter'
  | 'custom_question'
  | 'unknown'

export type FieldControl = 'native' | 'custom_button'

export interface LanguageEntry {
  name: string
  level: string
}

export interface EducationEntry {
  school: string
  degree: string
  years: string
}

export interface ExperienceEntry {
  title: string
  company: string
  start: string
  end: string
  description: string
}

export interface CandidateProfile {
  fullName: string
  email: string
  phone: string
  country: string
  city: string
  location: string
  linkedin: string
  github: string
  portfolio: string
  twitter: string
  telegram: string
  currentTitle: string
  currentCompany: string
  yearsExperience: string
  /** Comma-joined for form fill; prefer skillsList in the editor. */
  skills: string
  workExperience: string
  education: string
  languages: string
  skillsList: string[]
  languagesList: LanguageEntry[]
  educationList: EducationEntry[]
  experienceList: ExperienceEntry[]
  bio: string
  preferredSalary: string
  salaryAmount: string
  salaryCurrency: string
  salaryPeriod: string
  noticePeriod: string
  workArrangement: string
  employmentType: string
  availability: string
  timezone: string
  remoteExperience: string
  workAuthorization: string
  taxResidencyMatches: string
  willingToRelocate: string
  selfEmployed: string
  homeOffice: string
  asyncExperience: string
  referralSource: string
  coverLetterTone: CoverLetterTone
  geminiApiKey: string
}

export const DEFAULT_PROFILE: CandidateProfile = {
  fullName: '',
  email: '',
  phone: '',
  country: '',
  city: '',
  location: '',
  linkedin: '',
  github: '',
  portfolio: '',
  twitter: '',
  telegram: '',
  currentTitle: '',
  currentCompany: '',
  yearsExperience: '',
  skills: '',
  workExperience: '',
  education: '',
  languages: '',
  skillsList: [],
  languagesList: [],
  educationList: [],
  experienceList: [],
  bio: '',
  preferredSalary: '',
  salaryAmount: '',
  salaryCurrency: 'USD',
  salaryPeriod: 'month',
  noticePeriod: '',
  workArrangement: '',
  employmentType: '',
  availability: '',
  timezone: '',
  remoteExperience: '',
  workAuthorization: '',
  taxResidencyMatches: 'Yes',
  willingToRelocate: '',
  selfEmployed: '',
  homeOffice: '',
  asyncExperience: '',
  referralSource: '',
  coverLetterTone: 'professional',
  geminiApiKey: '',
}

export interface VacancyInfo {
  title: string
  company: string
  description: string
  pageUrl: string
}

export interface ScannedField {
  id: string
  tagName: string
  type: string
  name: string
  placeholder: string
  label: string
  ariaLabel: string
  autocomplete: string
  options: string[]
  intent: FieldIntent
  needsLlm: boolean
  currentValue: string
  control: FieldControl
}

export interface FieldAnswer {
  id: string
  value: string
}

export interface FillRequest {
  vacancy: VacancyInfo
  fields: ScannedField[]
}

export interface FillResponse {
  ok: boolean
  answers: FieldAnswer[]
  coverLetter: string
  fileUploadHint: boolean
  cvAttached?: boolean
  error?: string
  debug?: {
    scanned: number
    matched: number
    filled: number
    skipped: number
    filesFilled?: number
    unmatched: Array<{ id: string; intent: string; label: string }>
  }
}

export type MessageType =
  | { type: 'PING' }
  | { type: 'SCAN_PAGE' }
  | {
      type: 'FILL_PAGE'
      answers: FieldAnswer[]
      coverLetter: string
      attachCv?: boolean
      fileFields?: import('./cvTypes').ScannedFileField[]
    }
  | { type: 'GET_PROFILE' }
  | { type: 'SAVE_PROFILE'; profile: CandidateProfile }
  | { type: 'GET_CV_META' }
  | { type: 'SAVE_CV'; cv: import('./cvTypes').StoredCvFile }
  | { type: 'CLEAR_CV' }
  | { type: 'RUN_FILL' }

export type ScanPageResult = {
  vacancy: VacancyInfo
  fields: ScannedField[]
  fileUploadCount: number
  fileFields: import('./cvTypes').ScannedFileField[]
}

export type FillPageResult = {
  filled: number
  skipped: number
  filesFilled: number
}
