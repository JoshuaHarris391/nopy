import { create } from 'zustand'

interface UIState {
  loading: boolean
  setLoading: (loading: boolean) => void
}

export const useUIStore = create<UIState>()((set) => ({
  loading: false,
  setLoading: (loading) => set({ loading }),
}))
