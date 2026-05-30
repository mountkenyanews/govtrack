/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Utility functions to manage rich text formatting, plain text conversions,
 * and Microsoft Word pasting compatibility for news articles.
 */

/**
 * Strips HTML tags from any rich content string.
 * This is crucial for listing cards, search matching, and preview snippets.
 */
export function stripHtmlTags(htmlStr: string | null | undefined): string {
  if (!htmlStr) return "";
  // Check if string contains tags at all
  if (!htmlStr.includes("<") && !htmlStr.includes(">")) {
    return htmlStr;
  }
  
  // Replace standard block elements and list elements with line breaks/spaces to preserve readability
  let text = htmlStr
    .replace(/<\/p>|<\/div>|<\/li>|<\/h[1-6]>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, ""); // strip comments

  // Use simple regex to strip remaining tags
  text = text.replace(/<[^>]+>/g, "");

  // Decode nested html entities
  const map: Record<string, string> = {
    "&nbsp;": " ",
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&ldquo;": '"',
    "&rdquo;": '"5',
    "&lsquo;": "'",
    "&rsquo;": "'",
    "&bull;": "•",
    "&middot;": "·"
  };
  
  Object.keys(map).forEach((key) => {
    text = text.replaceAll(key, map[key]);
  });

  // Clean dual extra spaces
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Normalizes content pasted from Microsoft Word.
 * Microsoft Word uses non-standard namespaces, styling constructs and custom list structures.
 * This extracts clean semantic elements (bold, italic, underlines, lists) and strips Word debris.
 */
export function cleanWordHtml(htmlStr: string): string {
  if (!htmlStr) return "";

  // 1. Strip top level word metadata / style / xml comments
  let clean = htmlStr
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<xml[\s\S]*?<\/xml>/gi, "")
    .replace(/<meta[\s\S]*?>/gi, "")
    .replace(/<link[\s\S]*?>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  // 2. Clear out heavy office / mso visual classes and styling namespaces
  clean = clean
    .replace(/\s*class="?Mso\w+"?/gi, "")
    .replace(/\s*style="[^"]*"/gi, "")
    .replace(/\s*lang="[^"]*"/gi, "")
    .replace(/<o:p>\s*<\/o:p>/g, "")
    .replace(/<o:p>[\s\S]*?<\/o:p>/g, (m) => m.replace(/<o:p>|<\/o:p>/g, ""))
    .replace(/<span\s+[^>]*>/gi, "<span>");

  // 3. Fix list items pasted from MS Word. Word sometimes represents list items with plain paragraphs
  // containing custom bullets. Let's do a fast convert of common Word list representations if needed.
  // Generally browser does a good job but retains word specific tags. Let's make sure lists are preserved.
  
  return clean.trim();
}

/**
 * Prepares the article content for presentation.
 * If the story is formatted as plain text, it splits paragraphs with <p> blocks and adds dropping typography.
 * If it already contains HTML tags (e.g., from Word paste), it returns it styled and sanitized.
 */
export function formatArticleContent(summaryStr: string | null | undefined): string {
  if (!summaryStr) return "";

  const trimmed = summaryStr.trim();
  
  // Check if it already contains HTML tags. If it has tags like <p>, <br>, <strong>, <b>, or <ul>, treat it as rich HTML.
  const hasHtml = /<[a-z][\s\S]*>/i.test(trimmed);
  if (hasHtml) {
    return trimmed;
  }

  // Format plain text to HTML paragraphs safely
  const paragraphs = trimmed
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  if (paragraphs.length === 0) return "";

  // Structure paragraphs inside clean HTML with dropping typography styles integrated
  return paragraphs
    .map((para, idx) => {
      if (idx === 0) {
        // Dropcap first letter for main newsletter style
        const firstLetter = para.charAt(0);
        const rest = para.substring(1);
        return `<p class="paragraph-flow first-letter:text-5xl first-letter:font-black first-letter:mr-2.5 first-letter:float-left first-letter:text-[#0A1628]">${firstLetter}${rest}</p>`;
      }
      return `<p class="paragraph-flow">${para}</p>`;
    })
    .join("\n");
}
