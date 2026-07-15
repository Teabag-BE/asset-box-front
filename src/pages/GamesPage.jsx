// 미니게임 오락실 — 실제 게임 목록/런처는 별도 사이트(arcade)에서 관리하고 여기선 임베드만 한다.
const ARCADE_URL = 'https://arcade.teo-games.workers.dev'

export default function GamesPage() {
  return (
    <iframe
      src={ARCADE_URL}
      title="미니게임 오락실"
      className="w-full h-[calc(100vh-3.5rem)] border-0 block bg-[#F6F3EB]"
      allow="fullscreen; autoplay; gamepad; accelerometer; gyroscope; microphone; camera"
    />
  )
}
