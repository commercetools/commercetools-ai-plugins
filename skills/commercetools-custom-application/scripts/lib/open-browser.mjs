// Command to open a URL in the default browser. Arguments are passed as an array, never through a
// shell string, and only http(s) URLs are accepted.
export function openCommand(platform, url) {
  if (!/^https?:\/\/\S+$/.test(String(url ?? ''))) throw new Error(`Refusing to open a non-http(s) URL: ${url}`);
  if (platform === 'darwin') return { cmd: 'open', args: [url] };
  if (platform === 'win32') return { cmd: 'cmd', args: ['/c', 'start', '', url] };
  return { cmd: 'xdg-open', args: [url] };
}
