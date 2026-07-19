import { UPDATES } from '../data/updates'

// 배지 색: NEW=세이지(브랜드), 개선=파랑, FIX=주황, SOON=시안
const BADGE_STYLE = {
  NEW:  'bg-[#869B7E]/15 text-[#556350]',
  개선: 'bg-blue-100 text-blue-700',
  FIX:  'bg-amber-100 text-amber-700',
  SOON: 'bg-cyan-100 text-cyan-700',
}

function Badge({ kind }) {
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${BADGE_STYLE[kind] ?? 'bg-slate-100 text-slate-500'}`}>
      {kind}
    </span>
  )
}

export default function UpdatesPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-slate-900">📦 업데이트 노트</h1>
      <p className="text-sm text-slate-500 mt-1">AssetBox에 새로 들어온 기능과 개선사항 — 피드백은 언제든 환영이에요.</p>

      <div className="mt-8 space-y-10">
        {UPDATES.map((round, ri) => (
          <section key={round.id} className="bg-white border border-slate-200 rounded-2xl p-6">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h2 className="text-lg font-bold text-slate-800">{round.title} — {round.subtitle}</h2>
              <span className="text-xs text-slate-400 ml-auto">{round.date}</span>
              {ri === 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#869B7E] text-white">최신</span>}
            </div>
            <p className="text-sm text-slate-500 mt-2">{round.lede}</p>

            {round.sections.map(sec => (
              <div key={sec.name} className="mt-5">
                <p className="text-sm font-bold text-slate-700 border-b border-slate-100 pb-1.5">{sec.name}</p>
                <ul className="mt-2.5 space-y-2.5">
                  {sec.items.map(item => (
                    <li key={item.title} className="flex gap-2.5 items-start">
                      <Badge kind={item.badge} />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 leading-tight">{item.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  )
}
