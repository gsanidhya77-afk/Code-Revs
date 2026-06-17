import { useIdeConfig } from './use-ide-config'

export function useAiCli() {
  const { data: config } = useIdeConfig()
  const active = config?.aiCli?.active ?? null
  const available = config?.aiCli?.available ?? []
  const preferred = config?.aiCli?.preferred ?? 'auto'
  return {
    isAvailable: active != null,
    activeCli: active,
    availableClis: available,
    /** True when a CLI is installed but explicitly disabled via config (ai_cli: off). */
    isDisabledByConfig: preferred === 'off' && available.length > 0,
  }
}
