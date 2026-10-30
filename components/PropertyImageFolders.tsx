"use client";

import { useState } from "react";
import { useData } from "@/lib/DataContext";
import { galleryFolders, galleryLink } from "@/lib/galleryFolders";
import { copyText } from "@/lib/clipboard";
import { useToast } from "@/components/Toast";
import { PropertyImagesEditor } from "@/components/PropertyImagesTab";
import type { Property } from "@/lib/data";

export function PropertyImageFolders({ property }: { property: Property }) {
  const { units } = useData();
  const toast = useToast();
  const folders = galleryFolders(property, units);
  const [selected, setSelected] = useState(property.id);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const folder = folders.find((item) => item.id === selected) ?? property;
  const link = galleryLink(folder);

  function selectFolder(id: string) {
    if (id === folder.id || saving) return;
    if (dirty && !window.confirm("Discard unsaved photo changes and open another folder?")) return;
    setDirty(false);
    setSelected(id);
  }

  return <div className="flex min-w-0 flex-col gap-5">
    <div className="ui-card p-4 flex flex-col gap-3">
      <p className="text-sm font-semibold">Photo folders</p>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>A property folder and individual room folders appear automatically. Select a folder to upload and share its photos.</p>
      <div className="flex flex-wrap gap-2" aria-label="Photo folders">
        {folders.map((item, index) => <button key={item.id} type="button" className={`ui-btn max-w-full ${item.id === folder.id ? "ui-btn-primary" : ""}`} aria-pressed={item.id === folder.id} disabled={saving} onClick={() => selectFolder(item.id)}>
          <span className="break-words min-w-0">{index === 0 ? "Property photos" : item.shortName}</span>
        </button>)}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="ui-btn" onClick={async () => {
          toast.info(await copyText(link) ? `Link for ${folder.name} copied` : "Could not copy the link. Use Preview to open it.");
        }}>Copy folder link</button>
        <a className="text-sm underline" href={link} target="_blank" rel="noopener noreferrer">Preview folder</a>
        {dirty && <span className="text-xs" role="status">Save changes before sharing.</span>}
      </div>
    </div>
    <h2 className="text-base font-semibold break-words">{folder.name}</h2>
    <PropertyImagesEditor key={folder.id} property={folder} onDirtyChange={setDirty} onSavingChange={setSaving} />
  </div>;
}
