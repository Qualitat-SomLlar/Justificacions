import { appIcon } from "@/lib/app_icon";

// Favicon (browser tab)
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return appIcon(32);
}
