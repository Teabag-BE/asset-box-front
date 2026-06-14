export default function EmptyState({ icon = '📭', title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <span className="text-5xl mb-4">{icon}</span>
      {title       && <p className="text-slate-700 font-semibold text-lg mb-1">{title}</p>}
      {description && <p className="text-slate-400 text-sm mb-4">{description}</p>}
      {action}
    </div>
  )
}
