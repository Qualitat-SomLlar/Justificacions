import { appIcon } from "@/lib/app_icon";

// Icon of the app added to the home screen / Dock on Apple devices
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return appIcon(180, true);
}
