// app/(dashboard)/devices/_components/create-device-dialog.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { IconPlus, IconLoader, IconEye, IconEyeOff } from "@tabler/icons-react";

interface Props {
  onCreated: () => void;
}

const EMPTY_FORM = {
  name: "",
  type: "",
  brand: "",
  model: "",
  serial_no: "",
  condition: "GOOD",
  notes: "",
  has_keyboard: false,
  has_mouse: false,
  has_charger: false,
  has_extended_screen: false,
  password: "",
};

export function CreateDeviceDialog({ onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  function reset() {
    setForm(EMPTY_FORM);
    setShowPassword(false);
  }

  function set(key: string, value: unknown) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (
      !form.name ||
      !form.type ||
      !form.brand ||
      !form.model ||
      !form.serial_no
    ) {
      toast.error("Please fill in all required fields");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success("Device created successfully");
      reset();
      setOpen(false);
      onCreated();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create device",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button className="gap-2 h-9">
          <IconPlus className="h-4 w-4" />
          Add Device
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[500px] p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border/40">
          <DialogTitle>Add New Device</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-140px)]">
          <form
            id="create-device-form"
            onSubmit={handleSubmit}
            className="px-6 py-4 space-y-4"
          >
            {/* Name */}
            <div className="space-y-1.5">
              <Label>
                Device Name <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. MacBook Pro 2023"
              />
            </div>

            {/* Type + Condition */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>
                  Type <span className="text-destructive">*</span>
                </Label>
                <Select value={form.type} onValueChange={(v) => set("type", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LAPTOP">Laptop</SelectItem>
                    <SelectItem value="DESKTOP">Desktop</SelectItem>
                    <SelectItem value="PHONE">Phone</SelectItem>
                    <SelectItem value="TABLET">Tablet</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>
                  Condition <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={form.condition}
                  onValueChange={(v) => set("condition", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NEW">New</SelectItem>
                    <SelectItem value="GOOD">Good</SelectItem>
                    <SelectItem value="FAIR">Fair</SelectItem>
                    <SelectItem value="POOR">Poor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Brand + Model */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>
                  Brand <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={form.brand}
                  onChange={(e) => set("brand", e.target.value)}
                  placeholder="e.g. Apple"
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  Model <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={form.model}
                  onChange={(e) => set("model", e.target.value)}
                  placeholder="e.g. MacBook Pro M3"
                />
              </div>
            </div>

            {/* Serial Number */}
            <div className="space-y-1.5">
              <Label>
                Serial Number <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.serial_no}
                onChange={(e) => set("serial_no", e.target.value)}
                placeholder="e.g. SN-ABC123456"
                className="font-mono"
              />
            </div>

            {/* Accessories */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Accessories
              </Label>
              <div className="grid grid-cols-2 gap-3 p-3 rounded-lg border bg-muted/20">
                {(
                  [
                    { key: "has_keyboard", label: "Keyboard" },
                    { key: "has_mouse", label: "Mouse" },
                    { key: "has_charger", label: "Charger" },
                    { key: "has_extended_screen", label: "Extended Screen" },
                  ] as const
                ).map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-2">
                    <Checkbox
                      id={`create-${key}`}
                      checked={form[key]}
                      onCheckedChange={(v) => set(key, v === true)}
                    />
                    <Label
                      htmlFor={`create-${key}`}
                      className="text-sm font-normal cursor-pointer"
                    >
                      {label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* System Password */}
            <div className="space-y-1.5">
              <Label>
                System Password{" "}
                <span className="text-muted-foreground text-xs font-normal">
                  (optional)
                </span>
              </Label>
              <div className="relative">
                <Input
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                  type={showPassword ? "text" : "password"}
                  placeholder="Device login password…"
                  className="pr-10 font-mono"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? (
                    <IconEyeOff className="h-4 w-4" />
                  ) : (
                    <IconEye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label>
                Notes{" "}
                <span className="text-muted-foreground text-xs font-normal">
                  (optional)
                </span>
              </Label>
              <Textarea
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="Any additional notes…"
                rows={2}
                className="resize-none"
              />
            </div>
          </form>
        </ScrollArea>

        <DialogFooter className="px-6 py-4 border-t border-border/40 bg-muted/10">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="create-device-form"
            disabled={loading}
            className="gap-2"
          >
            {loading ? (
              <>
                <IconLoader className="h-4 w-4 animate-spin" /> Creating…
              </>
            ) : (
              "Add Device"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
