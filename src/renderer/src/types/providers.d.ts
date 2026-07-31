interface LocalSttStatus {
  state: 'stopped' | 'starting' | 'model-loading' | 'ready' | 'failed' | 'restarting';
  port?: number;
  model: string;
  device: 'cpu' | 'cuda' | 'auto';
  error?: string;
  pid?: number;
}

interface LocalSearchStatus {
  state: 'not-installed' | 'stopped' | 'installing' | 'starting' | 'ready' | 'external' | 'failed';
  installed: boolean;
  endpoint: string;
  managed: boolean;
  pid?: number;
  error?: string;
}

interface ProviderReadiness {
  audioReady: boolean;
  transcriptionReady: boolean;
  aiReady: boolean;
  canStartSession: boolean;
  errors: string[];
  warnings: string[];
  dataPath: {
    audioLeavesDevice: boolean;
    transcriptLeavesDevice: boolean;
    searchQueriesLeaveDevice: boolean;
    providers: string[];
  };
}
