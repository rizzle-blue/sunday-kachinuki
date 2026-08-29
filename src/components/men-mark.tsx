export function MenMark({ className }: Readonly<{ className?: string }>) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="men-mark-title men-mark-desc">
      <title id="men-mark-title">Sunday Kachinuki Men</title>
      <desc id="men-mark-desc">Biểu tượng mặt nạ Men của bộ giáp Kendo nhìn từ phía trước.</desc>
      <path d="M15 30C15 18 22 10 32 10s17 8 17 20v12c0 7-7 12-17 12S15 49 15 42V30Z" stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round" />
      <path d="M19 27h26M18 33h28M18 39h28M22 21v25M28 14v35M36 14v35M42 21v25" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M15 33 7 44l10-2M49 33l8 11-10-2" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
