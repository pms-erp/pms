// app/(dashboard)/attendance/locations/_components/locations-client.tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  IconMapPin,
  IconPlus,
  IconEdit,
  IconTrash,
  IconLoader,
  IconMapPinFilled,
  IconCurrentLocation,
  IconArrowLeft,
} from "@tabler/icons-react";
import Link from "next/link";

interface Location {
  id: string;
  name: string;
  latitude: string;
  longitude: string;
  radius_meters: number;
  is_active: boolean;
  created_at: string;
}

const EMPTY_FORM = {
  name: "",
  latitude: "",
  longitude: "",
  radius_meters: "100",
};

export function LocationsClient() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<Location | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);

  async function fetchLocations() {
    setLoading(true);
    try {
      const res = await fetch("/api/attendance/locations");
      const data = await res.json();
      setLocations(data.locations ?? []);
    } catch {
      toast.error("Failed to load locations");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchLocations();
  }, []);

  function openAdd() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(loc: Location) {
    setEditTarget(loc);
    setForm({
      name: loc.name,
      latitude: loc.latitude,
      longitude: loc.longitude,
      radius_meters: String(loc.radius_meters),
    });
    setDialogOpen(true);
  }

  async function useMyLocation() {
    setGettingLocation(true);
    try {
      const coords = await new Promise<{ latitude: number; longitude: number }>(
        (resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (pos) =>
              resolve({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
              }),
            () => reject(new Error("Location permission denied")),
            { enableHighAccuracy: true, timeout: 10000 },
          );
        },
      );
      setForm((f) => ({
        ...f,
        latitude: coords.latitude.toFixed(7),
        longitude: coords.longitude.toFixed(7),
      }));
      toast.success("Current location captured");
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Could not get location";
      toast.error(errorMessage);
    } finally {
      setGettingLocation(false);
    }
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    const lat = parseFloat(form.latitude);
    const lng = parseFloat(form.longitude);
    if (isNaN(lat) || isNaN(lng)) {
      toast.error("Valid latitude and longitude are required");
      return;
    }
    if (lat < -90 || lat > 90) {
      toast.error("Latitude must be between -90 and 90");
      return;
    }
    if (lng < -180 || lng > 180) {
      toast.error("Longitude must be between -180 and 180");
      return;
    }
    const radius = parseInt(form.radius_meters);
    if (isNaN(radius) || radius < 10 || radius > 500000) {
      toast.error("Radius must be between 10 and 500000 meters");
      return;
    }

    setSaving(true);
    try {
      if (editTarget) {
        const res = await fetch("/api/attendance/locations", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editTarget.id,
            name: form.name.trim(),
            latitude: lat,
            longitude: lng,
            radius_meters: radius,
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error);
        toast.success("Location updated");
      } else {
        const res = await fetch("/api/attendance/locations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name.trim(),
            latitude: lat,
            longitude: lng,
            radius_meters: radius,
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error);
        toast.success("Location added");
      }
      setDialogOpen(false);
      await fetchLocations();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to save";
      toast.error(errorMessage);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(loc: Location) {
    try {
      const res = await fetch("/api/attendance/locations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: loc.id, is_active: !loc.is_active }),
      });
      if (!res.ok) throw new Error();
      toast.success(loc.is_active ? "Location disabled" : "Location enabled");
      await fetchLocations();
    } catch {
      toast.error("Failed to update");
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/attendance/locations?id=${deleteId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      toast.success("Location deleted");
      setDeleteId(null);
      await fetchLocations();
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-6 mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/attendance">
            <IconArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">
            Attendance Locations
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage allowed check-in / check-out locations
          </p>
        </div>
        <Button onClick={openAdd} className="gap-2">
          <IconPlus className="h-4 w-4" />
          Add Location
        </Button>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
        <IconMapPin className="h-4 w-4 mt-0.5 shrink-0 text-blue-500" />
        <div>
          <p className="font-medium mb-0.5">How this works</p>
          <p className="text-blue-700/80">
            Users can only check in or check out when they are physically within
            the radius of one of these locations. If no locations are active,
            check-in will be blocked for everyone.
          </p>
        </div>
      </div>

      {/* Locations list */}
      {loading ? (
        <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
          <IconLoader className="h-5 w-5 animate-spin" />
          Loading locations…
        </div>
      ) : locations.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <IconMapPinFilled className="h-12 w-12 opacity-20" />
            <p className="font-medium">No locations added yet</p>
            <p className="text-sm text-center max-w-xs">
              Add at least one location so staff can check in and out.
            </p>
            <Button onClick={openAdd} variant="outline" className="gap-2 mt-2">
              <IconPlus className="h-4 w-4" />
              Add First Location
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {locations.map((loc) => (
            <Card
              key={loc.id}
              className={`transition-opacity ${!loc.is_active ? "opacity-50" : ""}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div
                    className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
                      loc.is_active
                        ? "bg-green-100 text-green-600"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <IconMapPin className="h-5 w-5" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold truncate">{loc.name}</p>
                      <Badge
                        variant="outline"
                        className={
                          loc.is_active
                            ? "bg-green-100 text-green-700 border-green-200 text-xs"
                            : "bg-muted text-muted-foreground text-xs"
                        }
                      >
                        {loc.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                      <span>
                        📍 {parseFloat(loc.latitude).toFixed(5)},{" "}
                        {parseFloat(loc.longitude).toFixed(5)}
                      </span>
                      <span>⭕ Radius: {loc.radius_meters}m</span>
                    </div>
                    <a
                      href={`https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-500 hover:underline mt-1 inline-block"
                    >
                      View on Google Maps ↗
                    </a>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch
                      checked={loc.is_active}
                      onCheckedChange={() => handleToggleActive(loc)}
                      title={loc.is_active ? "Disable" : "Enable"}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEdit(loc)}
                    >
                      <IconEdit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setDeleteId(loc.id)}
                    >
                      <IconTrash className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>
              {editTarget ? "Edit Location" : "Add New Location"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Location Name</Label>
              <Input
                placeholder="e.g. Main Office, Branch Office"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full gap-2"
              onClick={useMyLocation}
              disabled={gettingLocation}
            >
              {gettingLocation ? (
                <IconLoader className="h-4 w-4 animate-spin" />
              ) : (
                <IconCurrentLocation className="h-4 w-4" />
              )}
              {gettingLocation
                ? "Getting location…"
                : "Use My Current Location"}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  or enter manually
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Latitude</Label>
                <Input
                  placeholder="e.g. 30.1575"
                  value={form.latitude}
                  onChange={(e) =>
                    setForm({ ...form, latitude: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Longitude</Label>
                <Input
                  placeholder="e.g. 71.5249"
                  value={form.longitude}
                  onChange={(e) =>
                    setForm({ ...form, longitude: e.target.value })
                  }
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground -mt-1">
              To get coordinates: open{" "}
              <a
                href="https://maps.google.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 underline"
              >
                Google Maps
              </a>
              , right-click your location, and copy the numbers shown.
            </p>

            <div className="space-y-1.5">
              <Label>
                Allowed Radius{" "}
                <span className="text-muted-foreground font-normal">
                  (meters)
                </span>
              </Label>
              <Input
                type="number"
                min={10}
                max={5000}
                placeholder="100"
                value={form.radius_meters}
                onChange={(e) =>
                  setForm({ ...form, radius_meters: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                Users within this distance from the center can check in/out.
                100m ≈ one city block.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? (
                <>
                  <IconLoader className="h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : editTarget ? (
                "Save Changes"
              ) : (
                "Add Location"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>Delete Location</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Are you sure you want to delete this location? Users will no longer
            be able to check in from here.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteId(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
              className="gap-2"
            >
              {deleting ? (
                <>
                  <IconLoader className="h-4 w-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                "Delete"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
