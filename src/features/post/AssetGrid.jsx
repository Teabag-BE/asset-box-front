import AssetCard from './AssetCard'
import AssetCardSkeleton from './AssetCardSkeleton'
import EmptyState from '../../components/EmptyState'
import Button from '../../components/Button'

export default function AssetGrid({ posts = [], loading, error, onLoadMore, hasMore }) {
  if (error) {
    return <EmptyState icon="⚠️" title="불러오기 실패" description={error} />
  }

  const gridCls = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'

  return (
    <div>
      <div className={gridCls}>
        {loading && posts.length === 0
          ? Array.from({ length: 8 }).map((_, i) => <AssetCardSkeleton key={i} />)
          : posts.map(p => (
            <AssetCard
              key={p.id}
              id={p.id}
              title={p.title}
              thumbnailUrl={p.thumbnailUrl}
              authorNickname={p.authorNickname}
              authorId={p.authorId}
              tags={p.tags ?? []}
              createdAt={p.createdAt}
              fileExtension={p.fileExtension}
              viewCount={p.viewCount}
              likeCount={p.likeCount}
              commentCount={p.commentCount}
              downloadCount={p.downloadCount}
            />
          ))
        }
      </div>

      {!loading && posts.length === 0 && (
        <EmptyState icon="🧊" title="에셋이 없습니다" description="첫 번째 에셋을 등록해보세요." />
      )}

      {hasMore && !loading && (
        <div className="mt-8 flex justify-center">
          <Button variant="secondary" onClick={onLoadMore}>더 보기</Button>
        </div>
      )}

      {loading && posts.length > 0 && (
        <div className={`mt-4 ${gridCls}`}>
          {Array.from({ length: 4 }).map((_, i) => <AssetCardSkeleton key={i} />)}
        </div>
      )}
    </div>
  )
}
