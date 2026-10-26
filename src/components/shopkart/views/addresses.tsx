"use client";

// Addresses — list, add, edit, delete, set-default. Used from profile/checkout.

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { MapPin, Plus, Pencil, Trash2, Loader2, Star, Home, Briefcase, Building2 } from "lucide-react";
import { api, ApiClientError } from "@/lib/client/api";
import { useNav } from "@/lib/store";
import { useSession } from "@/lib/session";
import type { AddressView } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/shopkart/shared";

const addressSchema = z.object({
  fullName: z.string().min(2, "Enter the recipient name").max(60),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"),
  line1: z.string().min(5, "House / flat / building is required").max(120),
  line2: z.string().max(120).optional().or(z.literal("")),
  landmark: z.string().max(80).optional().or(z.literal("")),
  city: z.string().min(2, "City is required").max(50),
  state: z.string().min(2, "State is required").max(50),
  pincode: z.string().regex(/^\d{6}$/, "Enter a valid 6-digit PIN code"),
  type: z.enum(["HOME", "WORK", "OTHER"]),
  isDefault: z.boolean().optional(),
});

type AddressForm = z.infer<typeof addressSchema>;

const emptyForm: AddressForm = {
  fullName: "", phone: "", line1: "", line2: "", landmark: "",
  city: "", state: "", pincode: "", type: "HOME", isDefault: false,
};

export default function AddressesView(_props: { params?: Record<string, string>; mode?: string }) {
  const navigate = useNav((s) => s.navigate);
  const { user, loading: sessionLoading } = useSession();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AddressView | null>(null);
  const [deleting, setDeleting] = useState<AddressView | null>(null);
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["addresses"],
    queryFn: () => api.get<{ items: AddressView[] }>("/api/addresses"),
    enabled: !!user,
  });

  const form = useForm<AddressForm>({ resolver: zodResolver(addressSchema), defaultValues: emptyForm });

  const openAdd = () => {
    setEditing(null);
    form.reset(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (addr: AddressView) => {
    setEditing(addr);
    form.reset({
      fullName: addr.fullName, phone: addr.phone, line1: addr.line1,
      line2: addr.line2 ?? "", landmark: addr.landmark ?? "",
      city: addr.city, state: addr.state, pincode: addr.pincode,
      type: (addr.type as AddressForm["type"]) ?? "HOME", isDefault: addr.isDefault,
    });
    setDialogOpen(true);
  };

  const submit = async (values: AddressForm) => {
    setSaving(true);
    try {
      const payload = { ...values, line2: values.line2 || undefined, landmark: values.landmark || undefined };
      if (editing) {
        await api.patch(`/api/addresses/${editing.id}`, payload);
        toast.success("Address updated");
      } else {
        await api.post("/api/addresses", payload);
        toast.success("Address saved");
      }
      await qc.invalidateQueries({ queryKey: ["addresses"] });
      setDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not save address");
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!deleting) return;
    try {
      await api.del(`/api/addresses/${deleting.id}`);
      toast.success("Address removed");
      await qc.invalidateQueries({ queryKey: ["addresses"] });
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not remove address");
    } finally {
      setDeleting(null);
    }
  };

  const setDefault = async (addr: AddressView) => {
    try {
      await api.patch(`/api/addresses/${addr.id}`, { isDefault: true });
      await qc.invalidateQueries({ queryKey: ["addresses"] });
      toast.success("Default address updated");
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not update");
    }
  };

  if (sessionLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 px-4 py-6 sm:px-6">
        <Skeleton className="h-9 w-40" />
        {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <EmptyState
          icon={<MapPin size={28} />}
          title="Please sign in"
          description="Sign in to manage your delivery addresses."
          action={<Button onClick={() => navigate("login")}>Sign in</Button>}
        />
      </div>
    );
  }

  const items = data?.items ?? [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Saved Addresses</h1>
          <p className="text-sm text-muted-foreground">Manage where your orders get delivered.</p>
        </div>
        <Button onClick={openAdd} className="gap-1.5">
          <Plus size={16} /> Add new
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<MapPin size={28} />}
          title="No addresses yet"
          description="Add a delivery address to check out faster next time."
          action={<Button onClick={openAdd} className="gap-1.5"><Plus size={16} /> Add your first address</Button>}
        />
      ) : (
        <div className="space-y-3">
          {items.map((addr) => (
            <Card key={addr.id} className="py-0">
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{addr.fullName}</span>
                    <Badge variant="outline" className="gap-1 border-transparent bg-muted">
                      {addr.type === "HOME" ? <Home size={11} /> : addr.type === "WORK" ? <Briefcase size={11} /> : <Building2 size={11} />}
                      {addr.type}
                    </Badge>
                    {addr.isDefault && (
                      <Badge className="border-transparent bg-emerald-100 text-emerald-800">Default</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {addr.line1}{addr.line2 ? `, ${addr.line2}` : ""}
                    {addr.landmark ? ` · ${addr.landmark}` : ""}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {addr.city}, {addr.state} — <span className="font-medium text-foreground">{addr.pincode}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">Phone: {addr.phone}</p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {!addr.isDefault && (
                    <Button variant="outline" size="sm" className="gap-1" onClick={() => setDefault(addr)}>
                      <Star size={13} /> Default
                    </Button>
                  )}
                  <Button variant="outline" size="sm" aria-label={`Edit ${addr.fullName}`} onClick={() => openEdit(addr)}>
                    <Pencil size={13} />
                  </Button>
                  <Button
                    variant="outline" size="sm"
                    aria-label={`Delete ${addr.fullName}`}
                    className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                    onClick={() => setDeleting(addr)}
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sk-scrollbar sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit address" : "Add new address"}</DialogTitle>
            <DialogDescription>Use an address where someone is available to receive deliveries.</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(submit)} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Full name</Label>
              <Input id="fullName" placeholder="Recipient name" {...form.register("fullName")} />
              {form.formState.errors.fullName && <p className="text-xs text-rose-600">{form.formState.errors.fullName.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Mobile number</Label>
              <Input id="phone" inputMode="numeric" placeholder="10-digit mobile" {...form.register("phone")} />
              {form.formState.errors.phone && <p className="text-xs text-rose-600">{form.formState.errors.phone.message}</p>}
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="line1">Flat, house no., building</Label>
              <Input id="line1" placeholder="402, Sunrise Residency" {...form.register("line1")} />
              {form.formState.errors.line1 && <p className="text-xs text-rose-600">{form.formState.errors.line1.message}</p>}
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="line2">Area, colony, street (optional)</Label>
              <Input id="line2" placeholder="Koramangala 5th Block" {...form.register("line2")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="landmark">Landmark (optional)</Label>
              <Input id="landmark" placeholder="Near Forum Mall" {...form.register("landmark")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pincode">PIN code</Label>
              <Input id="pincode" inputMode="numeric" placeholder="560095" {...form.register("pincode")} />
              {form.formState.errors.pincode && <p className="text-xs text-rose-600">{form.formState.errors.pincode.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="city">City</Label>
              <Input id="city" placeholder="Bengaluru" {...form.register("city")} />
              {form.formState.errors.city && <p className="text-xs text-rose-600">{form.formState.errors.city.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="state">State</Label>
              <Input id="state" placeholder="Karnataka" {...form.register("state")} />
              {form.formState.errors.state && <p className="text-xs text-rose-600">{form.formState.errors.state.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Address type</Label>
              <Select value={form.watch("type")} onValueChange={(v) => form.setValue("type", v as AddressForm["type"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="HOME">Home</SelectItem>
                  <SelectItem value="WORK">Work</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 self-end pb-1 text-sm sm:col-span-2">
              <Checkbox checked={form.watch("isDefault")} onCheckedChange={(v) => form.setValue("isDefault", v === true)} />
              Make this my default address
            </label>
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving} className="gap-1.5">
                {saving && <Loader2 size={14} className="animate-spin" />}
                {editing ? "Save changes" : "Save address"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this address?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.fullName} — {deleting?.city} {deleting?.pincode}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={doDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
