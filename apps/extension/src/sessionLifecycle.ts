export interface TabUpdateChangeInfo {
  status?: string;
  url?: string;
  title?: string;
}

export function shouldStopSessionForTabUpdate(
  activeTabId: number | undefined,
  updatedTabId: number,
  changeInfo: TabUpdateChangeInfo
): boolean {
  if (activeTabId === undefined || activeTabId !== updatedTabId) {
    return false;
  }

  return changeInfo.status === "loading" || typeof changeInfo.url === "string";
}
