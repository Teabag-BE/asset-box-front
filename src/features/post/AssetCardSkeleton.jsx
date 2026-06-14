export default function AssetCardSkeleton() {
  return (
    <div className="bg-white rounded-xl overflow-hidden border border-slate-200">
      <div className="aspect-square bg-slate-100 animate-pulse" />
      <div className="p-3 space-y-2">
        <div className="h-4 bg-slate-100 animate-pulse rounded w-4/5" />
        <div className="h-3 bg-slate-100 animate-pulse rounded w-2/5" />
        <div className="flex gap-1">
          <div className="h-3 bg-slate-100 animate-pulse rounded-full w-10" />
          <div className="h-3 bg-slate-100 animate-pulse rounded-full w-10" />
        </div>
      </div>
    </div>
  )
}
