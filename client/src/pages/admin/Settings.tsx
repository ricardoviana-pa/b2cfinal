import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { Loader2, Save } from "lucide-react";

type SettingItem = {
  id: number;
  settingKey: string;
  settingValue: string;
  category: string | null;
};

function SettingField({
  label,
  settingKey,
  settings,
  onChange,
  multiline = false,
  placeholder = "",
}: {
  label: string;
  settingKey: string;
  settings: Record<string, string>;
  onChange: (key: string, value: string) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  const value = settings[settingKey] || "";
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {multiline ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(settingKey, e.target.value)}
          rows={3}
          placeholder={placeholder}
        />
      ) : (
        <Input
          value={value}
          onChange={(e) => onChange(settingKey, e.target.value)}
          placeholder={placeholder}
        />
      )}
    </div>
  );
}

export default function AdminSettings() {
  const utils = trpc.useUtils();
  const settingsQ = trpc.settings.list.useQuery();
  const upsertM = trpc.settings.upsert.useMutation({
    onSuccess: () => {
      utils.settings.list.invalidate();
    },
  });

  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Load settings into local state
  useEffect(() => {
    if (settingsQ.data) {
      const map: Record<string, string> = {};
      (settingsQ.data as SettingItem[]).forEach((s) => {
        map[s.settingKey] = s.settingValue;
      });
      setValues(map);
    }
  }, [settingsQ.data]);

  const handleChange = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const entries = Object.entries(values);
      for (const [key, value] of entries) {
        await upsertM.mutateAsync({ key, value, category: getCategoryForKey(key) });
      }
      toast.success("Settings saved");
    } catch (err: any) {
      toast.error(err.message || "Failed to save settings");
    }
    setSaving(false);
  };

  return (
    <div className="space-y-8 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Global site configuration and content settings.
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="bg-[#1A1A18] hover:bg-[#333330]">
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save all
        </Button>
      </div>

      {/* General */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">General</CardTitle>
          <CardDescription>Basic site information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SettingField label="Site name" settingKey="site_name" settings={values} onChange={handleChange} placeholder="Portugal Active" />
          <SettingField label="Site tagline" settingKey="site_tagline" settings={values} onChange={handleChange} placeholder="Private Hotels in Portugal" />
          <SettingField label="Site description (SEO)" settingKey="site_description" settings={values} onChange={handleChange} multiline placeholder="Default meta description for the website" />
        </CardContent>
      </Card>

      {/* Contact */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Contact information</CardTitle>
          <CardDescription>Displayed across the website</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SettingField label="Email" settingKey="contact_email" settings={values} onChange={handleChange} placeholder="hello@portugalactive.com" />
            <SettingField label="Phone" settingKey="contact_phone" settings={values} onChange={handleChange} placeholder="+351 927 161 771" />
            <SettingField label="WhatsApp number" settingKey="contact_whatsapp" settings={values} onChange={handleChange} placeholder="351927161771" />
            <SettingField label="Instagram" settingKey="social_instagram" settings={values} onChange={handleChange} placeholder="@portugalactive" />
          </div>
          <SettingField label="Address" settingKey="contact_address" settings={values} onChange={handleChange} multiline placeholder="Full address" />
        </CardContent>
      </Card>

      {/* Booking */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Booking</CardTitle>
          <CardDescription>External booking platform settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SettingField label="Guesty base URL" settingKey="guesty_base_url" settings={values} onChange={handleChange} placeholder="https://booking.portugalactive.com" />
          <SettingField label="Default booking CTA text" settingKey="booking_cta_text" settings={values} onChange={handleChange} placeholder="BOOK NOW" />
        </CardContent>
      </Card>

      {/* SEO */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">SEO and Analytics</CardTitle>
          <CardDescription>Search engine and tracking configuration</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SettingField label="Google Analytics ID" settingKey="google_analytics_id" settings={values} onChange={handleChange} placeholder="G-XXXXXXXXXX" />
          <SettingField label="Facebook Pixel ID" settingKey="facebook_pixel_id" settings={values} onChange={handleChange} placeholder="1234567890" />
          <SettingField label="Default OG image URL" settingKey="og_image_url" settings={values} onChange={handleChange} placeholder="https://..." />
        </CardContent>
      </Card>

      {/* Footer save */}
      <div className="flex justify-end pb-8">
        <Button onClick={handleSave} disabled={saving} className="bg-[#1A1A18] hover:bg-[#333330]">
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save all settings
        </Button>
      </div>
    </div>
  );
}

function getCategoryForKey(key: string): string {
  if (key.startsWith("site_")) return "general";
  if (key.startsWith("contact_") || key.startsWith("social_")) return "contact";
  if (key.startsWith("guesty_") || key.startsWith("booking_")) return "booking";
  if (key.startsWith("google_") || key.startsWith("facebook_") || key.startsWith("og_")) return "seo";
  return "general";
}
