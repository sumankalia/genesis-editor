"use client";

import {
  BLOCK_TOOLS,
  INLINE_TOOLS,
  MAX_LOCAL_UPLOAD_BYTES,
  type BuiltInToolName,
  type ParseMode,
} from "genesis-editor";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { MOCK_UPLOAD_URL, type UploadSettings } from "@/lib/upload-settings";

export type ThemeOption = "site" | "light" | "dark" | "system";

export type PlaygroundOptions = {
  theme: ThemeOption;
  editable: boolean;
  uploads: UploadSettings;
  /** Enabled built-in tools. */
  tools: BuiltInToolName[];
  /** Adds the example callout plugin. */
  callout: boolean;
  toolbarPlacement: "floating" | "fixed";
  /** `htmlMode` for pastes and Paste HTML. */
  htmlMode: ParseMode;
  /** `clean.noise`: remove page furniture (share bars, navigation, related posts) from pasted HTML. */
  cleanNoise: boolean;
};

export const ALL_TOOLS: BuiltInToolName[] = [...BLOCK_TOOLS, ...INLINE_TOOLS];

const modes = [
  {
    value: "local",
    label: "This browser",
    description: `No server. Images are embedded as data URLs and saved with the document (up to ${MAX_LOCAL_UPLOAD_BYTES / 1024 / 1024} MB each).`,
  },
  {
    value: "server",
    label: "Upload server",
    description: "uploadUrl: POSTs multipart/form-data (field file) and reads the URL from the JSON response.",
  },
  {
    value: "custom",
    label: "Custom function",
    description: "uploadFile: your own upload code returns the URL. This one posts to the mock server.",
  },
] as const;

export function OptionsPanel({
  options,
  onChange,
}: {
  options: PlaygroundOptions;
  onChange: (options: PlaygroundOptions) => void;
}) {
  const { uploads } = options;
  const setUploads = (patch: Partial<UploadSettings>) =>
    onChange({ ...options, uploads: { ...uploads, ...patch } });

  return (
    <div className="grid gap-5 text-sm" data-testid="options-panel">
      <div className="grid gap-2">
        <Label htmlFor="option-theme">theme</Label>
        <Select
          value={options.theme}
          onValueChange={(theme) => onChange({ ...options, theme: theme as ThemeOption })}
        >
          <SelectTrigger id="option-theme" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="site">Match site</SelectItem>
            <SelectItem value="light">Light</SelectItem>
            <SelectItem value="dark">Dark</SelectItem>
            <SelectItem value="system">System</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="option-editable">editable</Label>
        <Switch
          id="option-editable"
          checked={options.editable}
          onCheckedChange={(editable) => onChange({ ...options, editable })}
        />
      </div>

      <Separator />

      <ToolsFieldset options={options} onChange={onChange} />

      <Separator />

      <fieldset className="grid gap-3" data-testid="html-import-options">
        <legend className="mb-3 font-medium">HTML import</legend>
        <div className="grid gap-2">
          <Label htmlFor="option-html-mode">htmlMode</Label>
          <Select
            value={options.htmlMode}
            onValueChange={(htmlMode) => onChange({ ...options, htmlMode: htmlMode as ParseMode })}
          >
            <SelectTrigger id="option-html-mode" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="clean">Clean (keep custom colours)</SelectItem>
              <SelectItem value="strict">Strict (palette only, text of unknown elements)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="option-clean-noise" className="font-normal">
            Remove page furniture
          </Label>
          <Switch
            id="option-clean-noise"
            checked={options.cleanNoise}
            onCheckedChange={(cleanNoise) => onChange({ ...options, cleanNoise })}
          />
        </div>
      </fieldset>

      <Separator />

      <fieldset className="grid gap-3">
        <legend className="mb-3 font-medium">Image uploads</legend>
        <RadioGroup
          value={uploads.mode}
          onValueChange={(mode) => setUploads({ mode: mode as UploadSettings["mode"] })}
          className="gap-2"
        >
          {modes.map((mode) => (
            <Label
              key={mode.value}
              htmlFor={`upload-mode-${mode.value}`}
              className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal has-[[data-state=checked]]:border-foreground/40 has-[[data-state=checked]]:bg-muted/40"
            >
              <RadioGroupItem
                id={`upload-mode-${mode.value}`}
                value={mode.value}
                className="mt-0.5"
              />
              <span className="grid gap-1">
                <span className="font-medium">{mode.label}</span>
                <span className="text-xs leading-relaxed text-muted-foreground">
                  {mode.description}
                </span>
              </span>
            </Label>
          ))}
        </RadioGroup>

        {uploads.mode === "server" && (
          <div className="grid gap-4 pt-1">
            <div className="grid gap-2">
              <Label htmlFor="upload-url">Upload URL</Label>
              <Input
                id="upload-url"
                placeholder="https://example.com/upload"
                value={uploads.uploadUrl}
                aria-invalid={!uploads.uploadUrl.trim() || undefined}
                onChange={(event) => setUploads({ uploadUrl: event.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Cross-origin servers must allow CORS.{" "}
                <button
                  type="button"
                  className="cursor-pointer underline underline-offset-2 hover:text-foreground"
                  onClick={() => setUploads({ uploadUrl: MOCK_UPLOAD_URL })}
                >
                  Use the built-in mock server
                </button>
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="upload-response-path">
                Response field{" "}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="upload-response-path"
                placeholder="url"
                value={uploads.responsePath}
                onChange={(event) => setUploads({ responsePath: event.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Dot path to the URL in the JSON response, e.g. <code>data.link</code>.
              </p>
            </div>
          </div>
        )}
      </fieldset>
    </div>
  );
}

function ToolsFieldset({
  options,
  onChange,
}: {
  options: PlaygroundOptions;
  onChange: (options: PlaygroundOptions) => void;
}) {
  const enabled = new Set(options.tools);
  const toggle = (tool: BuiltInToolName, on: boolean) =>
    onChange({ ...options, tools: ALL_TOOLS.filter((t) => (t === tool ? on : enabled.has(t))) });

  const group = (title: string, tools: readonly BuiltInToolName[]) => (
    <div className="grid gap-2">
      <span className="text-xs text-muted-foreground">{title}</span>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        {title === "Blocks" && (
          <ToolCheckbox id="tool-paragraph" label="paragraph" checked disabled />
        )}
        {tools.map((tool) => (
          <ToolCheckbox
            key={tool}
            id={`tool-${tool}`}
            label={tool}
            checked={enabled.has(tool)}
            onCheckedChange={(on) => toggle(tool, on)}
          />
        ))}
      </div>
    </div>
  );

  return (
    <fieldset className="grid gap-4" data-testid="tools-panel">
      <legend className="mb-3 flex w-full items-center justify-between font-medium">
        tools
        <span className="flex gap-1">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => onChange({ ...options, tools: [...ALL_TOOLS] })}
          >
            All
          </Button>
          <Button variant="ghost" size="xs" onClick={() => onChange({ ...options, tools: [] })}>
            None
          </Button>
        </span>
      </legend>
      {group("Blocks", BLOCK_TOOLS)}
      {group("Inline", INLINE_TOOLS)}
      <div className="grid gap-2">
        <span className="text-xs text-muted-foreground">plugins</span>
        <ToolCheckbox
          id="tool-callout"
          label="callout (example plugin)"
          checked={options.callout}
          onCheckedChange={(callout) => onChange({ ...options, callout })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="option-toolbar">toolbar</Label>
        <Select
          value={options.toolbarPlacement}
          onValueChange={(placement) =>
            onChange({ ...options, toolbarPlacement: placement as PlaygroundOptions["toolbarPlacement"] })
          }
        >
          <SelectTrigger id="option-toolbar" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="floating">Floating (on selection)</SelectItem>
            <SelectItem value="fixed">Fixed (top of editor)</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </fieldset>
  );
}

function ToolCheckbox({
  id,
  label,
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}) {
  return (
    <Label
      htmlFor={id}
      className="flex cursor-pointer items-center gap-2 font-mono text-xs font-normal has-disabled:cursor-default has-disabled:opacity-60"
    >
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onCheckedChange?.(value === true)}
      />
      {label}
    </Label>
  );
}
