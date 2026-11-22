import { Suspense } from "react";
import FeedbackForm from "./feedback-form";

export default function TvFeedbackPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto min-h-screen max-w-lg bg-ocean-50 px-4 py-10 text-ocean-700">
          Loading…
        </main>
      }
    >
      <FeedbackForm />
    </Suspense>
  );
}