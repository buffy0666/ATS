import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Youtube from "@tiptap/extension-youtube";
import Placeholder from "@tiptap/extension-placeholder";

/**
 * The Tiptap extension set used by the rich editor + viewer.
 *
 * ALL of these are Tiptap OPEN SOURCE (MIT) extensions. No Pro/Cloud
 * extensions, no license key, no network calls to Tiptap. The YouTube
 * extension only renders an <iframe> embed; it does not call Tiptap servers.
 *
 * Portable: no app-specific imports here.
 */
export function buildExtensions(opts?: { placeholder?: string; editable?: boolean }) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4] },
    }),
    Underline,
    Highlight.configure({ multicolor: true }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
    }),
    Image.configure({
      inline: false,
      allowBase64: false, // images are uploaded via the host, never inlined as base64
    }),
    Youtube.configure({
      // youtube-nocookie keeps embeds privacy-friendly and matches the
      // sanitizer allowlist.
      nocookie: true,
      controls: true,
      modestBranding: true,
      width: 640,
      height: 360,
    }),
    Placeholder.configure({
      placeholder: opts?.placeholder ?? "Write the article…",
    }),
  ];
}
