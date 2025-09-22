import type { Metadata } from "next";
import { EmailOtpForm } from "@/components/auth/email-otp-form";

export const metadata: Metadata = {
  title: "Sign in • Book-N-Pay",
  description: "Secure, passwordless access for providers",
};

export default function LoginPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <EmailOtpForm />
    </div>
  );
}
