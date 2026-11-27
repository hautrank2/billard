export function GoogleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M21.6 12.227c0-.709-.064-1.39-.182-2.045H12v3.868h5.382a4.6 4.6 0 0 1-1.996 3.018v2.51h3.232c1.891-1.741 2.982-4.305 2.982-7.351Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.964-.895 6.618-2.423l-3.232-2.509c-.895.6-2.04.955-3.386.955-2.605 0-4.81-1.76-5.595-4.123h-3.34v2.591A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.405 13.9A6 6 0 0 1 6.09 12c0-.66.114-1.3.314-1.9V7.509h-3.34A10 10 0 0 0 2 12c0 1.614.386 3.14 1.064 4.491l3.34-2.591Z" />
      <path fill="#EA4335" d="M12 5.977c1.468 0 2.786.505 3.823 1.496l2.868-2.869C16.959 2.991 14.695 2 12 2a10 10 0 0 0-8.936 5.509l3.34 2.591C7.192 7.736 9.396 5.977 12 5.977Z" />
    </svg>
  );
}

export function CueIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="m3 19 2 2L21 3 3 19Z" />
      <path d="m7 15 2 2" />
      <circle cx="6" cy="6" r="3" />
    </svg>
  );
}
