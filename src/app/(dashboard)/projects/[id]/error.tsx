"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { IconAlertTriangle, IconArrowLeft } from "@tabler/icons-react";
import { useRouter } from "next/navigation";

export default function ProjectDetailsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
            <IconAlertTriangle className="h-6 w-6 text-red-600" />
          </div>
          <CardTitle className="text-2xl">Error Loading Project</CardTitle>
          <CardDescription>
            We couldn`t load the project details. Please try again.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-3 justify-center">
          <Button variant="outline" onClick={() => router.back()}>
            <IconArrowLeft className="mr-2 h-4 w-4" />
            Go Back
          </Button>
          <Button onClick={reset}>Try Again</Button>
        </CardContent>
      </Card>
    </div>
  );
}
