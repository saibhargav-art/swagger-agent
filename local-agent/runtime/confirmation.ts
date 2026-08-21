export function isApproval(message: string): boolean {
  return /^(yes|yes please|confirm|confirmed|approve|approved|proceed|go ahead|do it|ok|okay)$/i.test(message.trim())
}

export function isCancellation(message: string): boolean {
  return /^(no|cancel|stop|do not|don't|dont|never mind|nevermind)$/i.test(message.trim())
}
