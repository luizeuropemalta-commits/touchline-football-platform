import { Suspense } from "react";

import TouchlineNotFound from "@/components/touchline/TouchlineNotFound";

export default function NotFound() {
  return (
    <Suspense fallback={null}>
      <TouchlineNotFound />
    </Suspense>
  );
}
