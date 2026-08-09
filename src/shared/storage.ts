import type { CandidateProfile } from './types'
import { DEFAULT_PROFILE } from './types'
import { hydrateProfileLists, syncProfileListStrings } from './profileLists'

const STORAGE_KEY = 'applyFillerProfile'

export async function loadProfile(): Promise<CandidateProfile> {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  const stored = result[STORAGE_KEY] as Partial<CandidateProfile> | undefined
  return hydrateProfileLists({ ...DEFAULT_PROFILE, ...stored })
}

export async function saveProfile(profile: CandidateProfile): Promise<void> {
  const synced = syncProfileListStrings(hydrateProfileLists(profile))
  await chrome.storage.local.set({ [STORAGE_KEY]: synced })
}
