import type { CandidateProfile } from './types'
import { DEFAULT_PROFILE } from './types'
import { hydrateProfileLists, syncProfileListStrings } from './profileLists'
import { formatPreferredSalary } from './preferenceValues'

const STORAGE_KEY = 'applyFillerProfile'

function syncSalaryString(profile: CandidateProfile): CandidateProfile {
  if (profile.preferredSalary.trim()) return profile
  if (!profile.salaryAmount.trim()) return profile
  return {
    ...profile,
    preferredSalary: formatPreferredSalary({
      salaryAmount: profile.salaryAmount,
      salaryCurrency: profile.salaryCurrency,
      salaryPeriod: profile.salaryPeriod,
    }),
  }
}

export async function loadProfile(): Promise<CandidateProfile> {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  const stored = result[STORAGE_KEY] as Partial<CandidateProfile> | undefined
  return syncSalaryString(
    hydrateProfileLists({ ...DEFAULT_PROFILE, ...stored }),
  )
}

export async function saveProfile(profile: CandidateProfile): Promise<void> {
  const synced = syncSalaryString(
    syncProfileListStrings(hydrateProfileLists(profile)),
  )
  await chrome.storage.local.set({ [STORAGE_KEY]: synced })
}
