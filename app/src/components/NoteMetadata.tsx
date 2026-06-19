import type { NoteFrontmatter } from "../lib/markdown";

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
      <span className="min-w-14 shrink-0 font-medium text-slate-600">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span
            key={`${label}-${item}`}
            className="rounded-full bg-slate-100 px-2.5 py-0.5 text-slate-800"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

export function NoteMetadata({ metadata }: NoteMetadataProps) {
  return (
    <div className="mb-5 space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <MetadataRow label="tags" value={metadata.tags} />
      <MetadataRow label="date" value={metadata.date ?? ""} />
      <MetadataRow label="status" value={metadata.status ?? ""} />
      <MetadataRow label="type" value={metadata.type ?? ""} />
      <MetadataRow label="standards" value={metadata.standards} />
      {metadata.related.length > 0 && (
        <MetadataRow label="related" value={metadata.related} />
      )}
    </div>
  );
}
