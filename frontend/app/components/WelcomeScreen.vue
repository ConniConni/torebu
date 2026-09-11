<script setup lang="ts">
// 未ログイン時の「/」に表示するトップ画面（Issue #151）。
// 見出し・サブテキスト・下部バーの文言はHTML/CSSで重ね、イラストのみ画像を使う構成にしている
// （Issue #176）。画像に文字を焼き込んで全画面objectcoverする方式だと、画面比率によって
// 文字が見切れたり、絶対座標で重ねたボタンと画像内の文字が重なったりする問題があったため
import topIllustration from '~/assets/images/top_illustration.jpeg'
</script>

<template>
  <!-- PC等の広い画面では、スマホ幅のレイアウトをそのまま中央に固定表示し、
       左右は背景色で余白にする（PC専用の横並びレイアウトを別途作るのではなく、
       多くのモバイルファーストWebアプリで採用されている簡易な方式）。Issue #176
       高さもmax-h-[932px]（実在するスマホの中で最も縦長な部類の高さ）で頭打ちにしている。
       高さの上限を設けないと、デスクトップの縦に長いウィンドウでは「幅440px×高さ全部」という
       実機のスマホではあり得ない縦長比率になり、イラストのobject-coverが左右を過剰にクロップ
       してしまう（切れて見える）ため -->
  <div class="flex h-dvh w-full items-center justify-center overflow-hidden bg-brand-100">
    <div class="flex h-full max-h-[932px] w-full max-w-[440px] flex-col overflow-hidden bg-brand-50">
      <!-- 見出し・サブテキスト（HTML）。画面が小さいときも詰まりすぎないよう最小限のpaddingのみ -->
      <div class="shrink-0 px-6 pt-8 pb-4">
        <!-- 元画像に合わせて、スマホ幅では画面幅の6割程度（右端が64〜68%あたり）になるよう
             font-sizeをvw基準にして画面幅に比例させている。ただし上限を外して比率を保ったまま
             タブレット・デスクトップまで伸ばすと、見出しがイラストを押しつぶすほど巨大化して
             レイアウトが崩れるため、48pxで頭打ちにしている（タブレット以降は比率よりも
             レイアウトの破綻を防ぐことを優先）。なお外側をmax-w-[440px]で固定した現在は、
             vwの基準になる画面幅自体が広い画面でも実質440px相当を超えないため、この上限が
             効くのはウィンドウ幅が440pxに満たない場合のみ -->
        <h1
          class="-rotate-6 inline-block text-[clamp(24px,11vw,48px)] leading-snug text-gray-900"
          style="font-family: 'Yusei Magic', sans-serif"
        >
          一緒だから<br />
          <!-- スペース文字だと幅がフォント依存で不安定なため、0.5emのmargin-leftで
               文字半個分の間隔を作っている -->
          <span class="relative ml-[0.5em] inline-block">
            続けられる。
            <!-- 元画像の手描き風下線を再現。太さ・丸い端・わずかな傾きで、マーカーで
                 引いたような雰囲気に寄せている -->
            <svg
              viewBox="0 0 200 20"
              preserveAspectRatio="none"
              class="absolute -bottom-2 left-0 h-3 w-full text-brand-500"
              aria-hidden="true"
            >
              <path
                d="M4 15 Q 90 6, 196 10"
                fill="none"
                stroke="currentColor"
                stroke-width="7"
                stroke-linecap="round"
              />
            </svg>
          </span>
        </h1>
        <!-- 見出しのfont-sizeがvw基準で画面幅に比例するため、回転によるはみ出し量もスマホ幅では
             画面幅に比例して増える。固定pxのmarginだと広い画面で見出しと重なってしまうため
             vwを含む値にしているが、見出し側のfont-sizeが48pxで頭打ちになるのに合わせて
             こちらも2.75remで頭打ちにし、広い画面で余白が際限なく広がらないようにしている -->
        <p
          class="text-sm leading-relaxed text-gray-700"
          style="margin-top: clamp(1.25rem, calc(1.25rem + 6vw), 2.75rem)"
        >
          トレーニングの記録を仲間とシェアして、<br />
          もっと楽しく、もっと続く。
        </p>
      </div>

      <!-- イラスト部分。残りの高さをすべて使い、画面比率に応じてobject-coverで自然にクロップする -->
      <div class="min-h-0 flex-1">
        <img :src="topIllustration" alt="" class="h-full w-full object-cover object-top" />
      </div>

      <!-- 下部バー（HTML）。文言・ボタンとも画像から独立しているので重なりが起きない -->
      <div
        class="shrink-0 bg-brand-600 px-6 pt-5 text-white"
        style="padding-bottom: max(1.25rem, env(safe-area-inset-bottom))"
      >
        <div class="flex items-center gap-3 text-sm font-semibold">
          <!-- ダンベルアイコン。プレート・バーをrectで組んだ左右対称の自作アイコン
               （既存のMaterial Symbolsパスは右側プレートの座標がずれて見えたため、
               太さも含めて自前で組み直した） -->
          <svg viewBox="0 0 24 24" fill="currentColor" class="h-6 w-6 shrink-0" aria-hidden="true">
            <g transform="rotate(-35 12 12)">
              <rect x="1" y="7" width="3" height="10" rx="1.2" />
              <rect x="5" y="5" width="2" height="14" rx="1" />
              <rect x="7" y="10.5" width="10" height="3" rx="1" />
              <rect x="17" y="5" width="2" height="14" rx="1" />
              <rect x="20" y="7" width="3" height="10" rx="1.2" />
            </g>
          </svg>
          <p class="leading-relaxed">
            仲間と一緒に、<br />
            あなたの筋トレをもっと楽しく。
          </p>
        </div>

        <div class="mt-4 flex gap-3">
          <NuxtLink
            to="/login"
            class="flex-1 rounded-full bg-white py-2.5 text-center text-sm font-semibold text-brand-700 shadow"
          >
            ログイン
          </NuxtLink>
          <NuxtLink
            to="/register"
            class="flex-1 rounded-full border border-white py-2.5 text-center text-sm font-semibold text-white"
          >
            新規登録
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>
