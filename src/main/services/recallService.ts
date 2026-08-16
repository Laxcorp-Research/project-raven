/**
 * Recall is removed from the product. These exports stay so boot/tests
 * that still import the module do not crash. Nothing here loads
 * @recallai/desktop-sdk or spawns agent-windows.exe.
 */

export function isRecallSupported(): boolean {
  return false
}

export async function initRecallSdk(): Promise<boolean> {
  return false
}

export function isRecallSdkReady(): boolean {
  return false
}
