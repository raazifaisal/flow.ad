import { create } from 'zustand';

export type EngineRuntimeStates = 'DISCONNECTED' | 'CONNECTED' | 'STREAMING' | 'BARGE_IN_FREEZE' | 'CREATIVE_PROCESSING';

interface FrameworkStore {
  runtimeState: EngineRuntimeStates;
  renderedAdUrl: string | null;
  agentLedger: Array<{ agent: string; execution: string }>;
  setRuntimeState: (state: EngineRuntimeStates) => void;
  setAdUrl: (url: string) => void;
  appendLedgerEntry: (agent: string, execution: string) => void;
  purgeEngine: () => void;
}

export const useAppState = create<FrameworkStore>((set) => ({
  runtimeState: 'DISCONNECTED',
  renderedAdUrl: null,
  agentLedger: [],
  setRuntimeState: (state) => set({ runtimeState: state }),
  setAdUrl: (url) => set({ renderedAdUrl: url, runtimeState: 'CREATIVE_PROCESSING' }),
  appendLedgerEntry: (agent, execution) => set((state) => ({ 
    agentLedger: [...state.agentLedger, { agent, execution }] 
  })),
  purgeEngine: () => set({ runtimeState: 'DISCONNECTED', renderedAdUrl: null, agentLedger: [] }),
}));
