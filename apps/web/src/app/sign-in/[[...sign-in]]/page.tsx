import { SignIn } from "@clerk/nextjs";
import TelegramSignIn from "@/components/telegram-sign-in";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md space-y-4">
        <TelegramSignIn />
        <div className="rounded-3xl border border-[rgba(255,255,255,0.08)] bg-[rgba(0,0,0,0.35)] p-6">
          <SignIn />
        </div>
      </div>
    </div>
  );
}
