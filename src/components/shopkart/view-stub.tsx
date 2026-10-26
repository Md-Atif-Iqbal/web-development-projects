"use client";

import { Construction } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNav } from "@/lib/store";

export function ViewStub({ title }: { title: string }) {
  const goHome = useNav((s) => s.goHome);
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
      <div className="rounded-full bg-muted p-5 text-muted-foreground">
        <Construction size={32} />
      </div>
      <h1 className="text-xl font-bold">{title} is on the way</h1>
      <p className="text-sm text-muted-foreground">This ShopEase section is being built right now. Please check back shortly.</p>
      <Button onClick={goHome}>Back to home</Button>
    </div>
  );
}
