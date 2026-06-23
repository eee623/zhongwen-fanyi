import type { ApiToClientMessage, ExtensionSettings } from "@realtime-dubbing/shared";
import type { FileAccessStatus } from "./fileAccess";

export type PopupMessage =
  | {
      type: "popup.start";
      settings: ExtensionSettings;
      clientToken: string;
    }
  | {
      type: "popup.stop";
    }
  | {
      type: "popup.update-settings";
      settings: ExtensionSettings;
    }
  | {
      type: "popup.get-status";
    }
  | {
      type: "popup.get-file-access-status";
    }
  | {
      type: "popup.open-extension-details";
      url: string;
    }
  | {
      type: "popup.open-url";
      url: string;
    };

export type OffscreenCommand =
  | {
      type: "offscreen.start";
      streamId: string;
      tabId: number;
      settings: ExtensionSettings;
      clientToken: string;
    }
  | {
      type: "offscreen.stop";
    }
  | {
      type: "offscreen.settings";
      settings: ExtensionSettings;
    };

export type OffscreenEvent =
  | {
      type: "offscreen.status";
      status: "idle" | "starting" | "running" | "stopped" | "error";
      message?: string;
    }
  | {
      type: "offscreen.api-event";
      event: ApiToClientMessage;
    };

export type ContentMessage =
  | {
      type: "subtitle.update";
      text: string;
      stash?: string;
      subtitleSize: number;
      visible: boolean;
      floatingVisible: boolean;
      fullscreenVisible: boolean;
    }
  | {
      type: "subtitle.clear";
    }
  | {
      type: "content.forward-runtime-message";
      message: PopupMessage;
    }
  | {
      type: "subtitle.settings";
      subtitleSize: number;
      visible: boolean;
      floatingVisible: boolean;
      fullscreenVisible: boolean;
    };

export type RuntimeMessage = PopupMessage | OffscreenCommand | OffscreenEvent | ContentMessage;

export interface RuntimeStatus {
  running: boolean;
  tabId?: number;
  lastError?: string;
}

export interface RuntimeResponse {
  ok: boolean;
  status?: RuntimeStatus;
  fileAccess?: FileAccessStatus;
  error?: string;
}
