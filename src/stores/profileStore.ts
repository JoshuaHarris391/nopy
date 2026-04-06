import { create } from 'zustand'
import { get, set } from 'idb-keyval'
import type { PsychologicalProfile } from '../types/profile'
import { saveProfileToDisk } from '../services/fs'
import { useSettingsStore } from './settingsStore'

interface ProfileState {
  profile: PsychologicalProfile | null
  loaded: boolean
  loadProfile: () => Promise<void>
  setProfile: (profile: PsychologicalProfile) => Promise<void>
}

export const useProfileStore = create<ProfileState>()((setState) => ({
  profile: null,
  loaded: false,

  loadProfile: async () => {
    const profile = await get<PsychologicalProfile>('nopy-profile')
    setState({ profile: profile ?? null, loaded: true })
  },

  setProfile: async (profile) => {
    setState({ profile })
    await set('nopy-profile', profile)
    await saveProfileToDisk(profile, useSettingsStore.getState().journalPath)
  },
}))
