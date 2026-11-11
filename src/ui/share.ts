export type ShareOutcome = 'shared' | 'copied' | 'manual'

/** The result line with the link after it, as it is copied or shown for copying. */
export const shareMessage = (text: string, url: string): string => `${text} ${url}`

/** The page's address without its query or hash, so a shared link starts a game of one's own. */
export const pageUrl = (): string => window.location.href.split(/[?#]/)[0]

/**
 * Shares the result: through the system's share sheet when there is one, else by copying the line
 * and the link to the clipboard. 'manual' when neither works, so the screen can show the text to
 * copy by hand. Cancelling the share sheet also gives 'manual' and leaves the clipboard alone.
 */
export async function shareResult(text: string, url: string): Promise<ShareOutcome> {
  const nav: Partial<Navigator> | undefined = globalThis.navigator
  if (typeof nav?.share === 'function') {
    try {
      await nav.share({ text, url })
      return 'shared'
    } catch (error) {
      if ((error as { name?: unknown } | null)?.name === 'AbortError') return 'manual'
      // Not allowed here: try the clipboard instead.
    }
  }
  if (typeof nav?.clipboard?.writeText === 'function') {
    try {
      await nav.clipboard.writeText(shareMessage(text, url))
      return 'copied'
    } catch {
      // Not allowed here either (an insecure page, a refused permission).
    }
  }
  return 'manual'
}
