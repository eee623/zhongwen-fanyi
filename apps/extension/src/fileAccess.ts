export interface FileAccessStatus {
  ok: boolean;
  isFilePage: boolean;
  allowed: boolean;
  manageUrl: string;
  message?: string;
}

export interface ChromeFileAccessApi {
  runtime: {
    id?: string;
  };
  tabs: {
    query(queryInfo: { active: boolean; currentWindow: boolean }): Promise<Array<{ url?: string }>>;
  };
  extension: {
    isAllowedFileSchemeAccess(): Promise<boolean>;
  };
}

const FILE_ACCESS_MESSAGE = "本地视频页需要先开启扩展的 file:// 访问权限";
const UNSUPPORTED_LOCAL_MEDIA_MESSAGE = "第一版仅支持 Chrome 可直接播放的本地视频，mkv/avi 暂不支持";
const UNSUPPORTED_LOCAL_FILE_MESSAGE = "第一版仅支持 Chrome 可直接播放的本地 mp4/webm 视频或 HTML5 测试页";
const UNSUPPORTED_LOCAL_MEDIA_EXTENSIONS = new Set([".avi", ".mkv"]);
const SUPPORTED_LOCAL_FILE_EXTENSIONS = new Set([".htm", ".html", ".m4v", ".mp4", ".webm"]);

export function isFileUrl(url: string | undefined): boolean {
  if (!url) {
    return false;
  }

  try {
    return new URL(url).protocol === "file:";
  } catch {
    return false;
  }
}

export function extensionDetailsUrl(extensionId: string | undefined): string {
  return extensionId ? `chrome://extensions/?id=${encodeURIComponent(extensionId)}` : "chrome://extensions/";
}

export function fileAccessStatusForTabUrl(
  tabUrl: string | undefined,
  allowedFileSchemeAccess: boolean,
  extensionId: string | undefined
): FileAccessStatus {
  const manageUrl = extensionDetailsUrl(extensionId);
  const isFilePage = isFileUrl(tabUrl);
  if (!isFilePage) {
    return {
      ok: true,
      isFilePage: false,
      allowed: true,
      manageUrl
    };
  }

  if (allowedFileSchemeAccess) {
    if (hasUnsupportedLocalMediaExtension(tabUrl)) {
      return {
        ok: false,
        isFilePage: true,
        allowed: true,
        manageUrl,
        message: UNSUPPORTED_LOCAL_MEDIA_MESSAGE
      };
    }
    if (!hasSupportedLocalFileExtension(tabUrl)) {
      return {
        ok: false,
        isFilePage: true,
        allowed: true,
        manageUrl,
        message: UNSUPPORTED_LOCAL_FILE_MESSAGE
      };
    }

    return {
      ok: true,
      isFilePage: true,
      allowed: true,
      manageUrl
    };
  }

  return {
    ok: false,
    isFilePage: true,
    allowed: false,
    manageUrl,
    message: FILE_ACCESS_MESSAGE
  };
}

export async function getCurrentTabFileAccessStatus(
  api: ChromeFileAccessApi = chrome
): Promise<FileAccessStatus> {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  if (!isFileUrl(tab?.url)) {
    return fileAccessStatusForTabUrl(tab?.url, false, api.runtime.id);
  }

  const allowed = await api.extension.isAllowedFileSchemeAccess();
  return fileAccessStatusForTabUrl(tab?.url, allowed, api.runtime.id);
}

function hasUnsupportedLocalMediaExtension(url: string | undefined): boolean {
  const extension = localFileExtension(url);
  return extension ? UNSUPPORTED_LOCAL_MEDIA_EXTENSIONS.has(extension) : false;
}

function hasSupportedLocalFileExtension(url: string | undefined): boolean {
  const extension = localFileExtension(url);
  return extension ? SUPPORTED_LOCAL_FILE_EXTENSIONS.has(extension) : false;
}

function localFileExtension(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }

  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const filename = pathname.split("/").at(-1) ?? "";
    const dotIndex = filename.lastIndexOf(".");
    return dotIndex >= 0 ? filename.slice(dotIndex) : undefined;
  } catch {
    return undefined;
  }
}
