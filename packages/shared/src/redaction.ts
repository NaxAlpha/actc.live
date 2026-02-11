const TOKEN_PATTERNS: RegExp[] = [
  /(rtmp:\/\/[^\s/]+\/[^\s/]+\/)([A-Za-z0-9_\-]+)/gi,
  /(rtmps:\/\/[^\s/]+\/[^\s/]+\/)([A-Za-z0-9_\-]+)/gi,
  /("access_token"\s*:\s*")([^"]+)(")/gi,
  /("refresh_token"\s*:\s*")([^"]+)(")/gi,
  /(Bearer\s+)([A-Za-z0-9._\-]+)/gi
];

export const redactSensitive = (value: string): string => {
  return TOKEN_PATTERNS.reduce((output, pattern) => {
    return output.replace(pattern, (_match, prefix: string, token: string, suffix?: string) => {
      const masked = `${token.slice(0, 3)}***${token.slice(-3)}`;
      return `${prefix}${masked}${suffix ?? ""}`;
    });
  }, value);
};
