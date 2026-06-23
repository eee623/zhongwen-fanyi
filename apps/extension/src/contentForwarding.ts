import type { PopupMessage, RuntimeMessage } from "./messages";

export function extractForwardedRuntimeMessage(message: RuntimeMessage): PopupMessage | undefined {
  return message.type === "content.forward-runtime-message" ? message.message : undefined;
}
