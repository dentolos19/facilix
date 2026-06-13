import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";

export const Route = createFileRoute("/(platform)/settings")({
  component: Page,
});

const THEME_OPTIONS = [
  { value: "system", label: "System", description: "Follow your device's theme setting" },
  { value: "light", label: "Light", description: "Always use light mode" },
  { value: "dark", label: "Dark", description: "Always use dark mode" },
] as const;

function Page() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-heading font-medium text-lg tracking-tight">Settings</h1>
          <p className="text-muted-foreground text-xs">Manage your application preferences</p>
        </div>
        <Link to="/dashboard">
          <Button size="sm" variant="outline">
            <ArrowLeftIcon className="size-4" />
            Back to Dashboard
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Choose how Facilix looks on your device.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="theme-select">Theme</Label>
              <Select onValueChange={(value) => setTheme(value)} value={mounted ? theme : undefined}>
                <SelectTrigger className="w-full" id="theme-select">
                  <SelectValue placeholder="Select a theme" />
                </SelectTrigger>
                <SelectContent>
                  {THEME_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {mounted && theme && (
              <p className="text-muted-foreground text-xs">
                {THEME_OPTIONS.find((o) => o.value === theme)?.description}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
