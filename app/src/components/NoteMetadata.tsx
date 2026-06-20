import { usePreferences } from "../context/PreferencesContext";
import type { NoteFrontmatter } from "../lib/markdown";
import type { MessageKey } from "../lib/i18n";

interface NoteMetadataProps {
  metadata: NoteFrontmatter;
}

function MetadataRow({
  label,
  value,
}: {
  label: string;
  value: string | string[];
}) {
  const items = Array.isArray(value) ? value : [value];
  if (items.length === 0 || (items.length === 1 && !items[0])) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-start gap-x-2 gap-y-1 text-sm leading-6">
      <span className="min-w-14 shrink-0 font-medium text-brand-muted">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span
            key={`${label}-${item}`}
            className="rounded-full bg-brand-paper px-2.5 py-0.5 text-brand-ink"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

export function NoteMetadata({ metadata }: NoteMetadataProps) {
  const { tr } = usePreferences();

  const label = (key: MessageKey) => tr(key);

  return (
    <div className="mb-5 space-y-2 rounded-xl border border-brand-border bg-brand-paper px-4 py-3">
      <MetadataRow label={label("metadataTags")} value={metadata.tags} />
      <MetadataRow label={label("metadataDate")} value={metadata.date ?? ""} />
      <MetadataRow label={label("metadataStatus")} value={metadata.status ?? ""} />
      <MetadataRow label={label("metadataType")} value={metadata.type ?? ""} />
      <MetadataRow label={label("metadataStandards")} value={metadata.standards} />
      {metadata.related.length > 0 && (
        <MetadataRow label={label("metadataRelated")} value={metadata.related} />
      )}
    </div>
  );
}
