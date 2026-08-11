/**
 * Auth layout — minimal wrapper.
 * Each page (login, signup, onboarding) controls its own split layout.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-black">
      {children}
    </div>
  );
}
