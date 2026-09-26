import { defineConfig } from 'vitest/config'

// 시간 관련 회귀(#104: TZ 없는 서버 시각이 9시간 어긋남)는 러너 TZ 가 UTC 면 재현되지 않는다.
// GitHub Actions ubuntu 러너 기본 TZ 는 UTC → 여기서 KST 로 고정해야 테스트가 버그를 잡는다.
// (forks 풀의 워커는 이 프로세스의 env 를 상속한다)
process.env.TZ = 'Asia/Seoul'

export default defineConfig({
  // 순수 로직 테스트만 돌리므로 react/tailwind 플러그인·dev 서버 프록시는 불필요 → vite.config.js 와 분리
  test: {
    environment: 'node',
    include: ['src/**/*.test.{js,jsx}'],
    restoreMocks: true,
    unstubGlobals: true,
  },
})
