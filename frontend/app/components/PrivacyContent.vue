<script setup lang="ts">
// プライバシーポリシーの本文（Issue #160）。ページ（/privacy）とモーダル（Issue #189）の両方から使う
</script>

<template>
  <div>
    <p class="mb-1 text-xl font-bold text-gray-900 dark:text-ink">プライバシーポリシー</p>
    <p class="mb-6 text-xs text-gray-500 dark:text-muted">最終更新日：2026年10月28日</p>

    <div class="space-y-6 text-sm leading-relaxed text-gray-700 dark:text-ink">
      <section>
        <p>
          トレ部（以下「本サービス」）を運営するトレ部 運用事務局（以下「運営者」）は、
          ユーザーの個人情報を以下の方針に基づいて取り扱います。
        </p>
      </section>

      <section>
        <h2 class="mb-2 font-semibold text-gray-900 dark:text-ink">1. 運営者情報</h2>
        <p>
          運営者：トレ部 運用事務局<br />
          お問い合わせ先：torebu1442@gmail.com
        </p>
      </section>

      <section>
        <h2 class="mb-2 font-semibold text-gray-900 dark:text-ink">2. 収集する情報</h2>
        <p>本サービスは、ユーザーの登録・利用にあたり、以下の情報を収集します。</p>
        <ul class="mt-2 list-disc space-y-1 pl-5">
          <li>メールアドレス、パスワード</li>
          <li>表示名</li>
          <li>生年月、性別、職業</li>
          <li>
            トレーニング記録（種目・重量・回数・記録日時等）、ルーティン、グループ内でのリアクション・
            コメント
          </li>
          <li>グループの作成・参加状況</li>
          <li>登録のきっかけ（他のユーザーがシェアした記録の画像経由で登録したかどうか）</li>
          <li>
            本サービスで不具合が起きた際のエラー情報（エラーの内容、発生したページ、ブラウザ・端末の
            種類、エラーが起きるまでの画面遷移・操作の履歴等）
          </li>
        </ul>
      </section>

      <section>
        <h2 class="mb-2 font-semibold text-gray-900 dark:text-ink">3. 利用目的</h2>
        <p>収集した情報は、以下の目的で利用します。</p>
        <ul class="mt-2 list-disc space-y-1 pl-5">
          <li>
            本サービスの提供（ログイン認証、記録の保存・表示、グループ内での共有・ランキング表示等）
          </li>
          <li>不正利用の防止、お問い合わせへの対応</li>
          <li>エラー情報は、本サービスの不具合の検知・調査・修正に利用します</li>
          <li>
            登録のきっかけは、記録のシェア機能の効果を確かめるなど、本サービスの改善に利用します
          </li>
          <li>
            生年月・性別・職業は、将来的に属性別の傾向分析機能（例：年代別のトレーニング傾向表示）の
            提供に利用する場合があります
          </li>
        </ul>
      </section>

      <section>
        <h2 class="mb-2 font-semibold text-gray-900 dark:text-ink">4. 個人情報の第三者提供</h2>
        <p>運営者は、法令に基づく場合を除き、ユーザーの同意なく個人情報を第三者に提供しません。</p>
      </section>

      <section>
        <h2 class="mb-2 font-semibold text-gray-900 dark:text-ink">5. 個人情報の取扱いの委託</h2>
        <p>
          本サービスの運営に必要な範囲で、データベースホスティング等のインフラ事業者に個人情報の
          取扱いを委託することがあります。委託先には利用目的の達成に必要な範囲でのみデータを提供し、
          適切な管理を求めています。
        </p>
        <p class="mt-2">
          エラー情報の収集・分析には、エラー監視サービス「Sentry」（米国のFunctional Software,
          Inc.が提供）を利用しています。エラー情報には、メールアドレス・パスワード・入力内容・Cookie等、
          個人を特定できる情報を含めないよう送信前に取り除いており、IPアドレスも保存しない設定にしています。
          ただし、送信時の通信元のIPアドレスから推定されるおおまかな地域（国・市区町村程度。多くの場合、
          ご利用の通信事業者の設備の所在地です）は、Sentryにより記録されます。
        </p>
      </section>

      <section>
        <h2 class="mb-2 font-semibold text-gray-900 dark:text-ink">6. 利用者情報の外部送信</h2>
        <p>
          本サービスでは、以下のとおり、ユーザーの端末（ブラウザ）から外部の事業者へ情報が送信されます。
        </p>
        <ul class="mt-2 list-disc space-y-2 pl-5">
          <li>
            送信先：Functional Software, Inc.（エラー監視サービス「Sentry」）<br />
            送信される情報：エラーの内容、発生したページのURL（招待コード等の秘密の値は伏せたもの）、
            ブラウザ・端末の種類、エラーが起きるまでの画面遷移・操作・通信先の履歴、通信元のIPアドレス
            （Sentryでは保存せず、おおまかな地域の推定にのみ使われます）<br />
            目的：本サービスの不具合の検知・調査・修正
          </li>
          <li>
            送信先：Google LLC（Google Fonts）<br />
            送信される情報：IPアドレス、ブラウザの種類、閲覧しているサイト（torebu.com）の情報等<br />
            目的：画面の一部の文字を表示するためのフォントの取得
          </li>
        </ul>
      </section>

      <section>
        <h2 class="mb-2 font-semibold text-gray-900 dark:text-ink">
          7. 保有個人データの開示・訂正・利用停止等
        </h2>
        <p>
          ユーザーは、運営者に対し、自身の個人情報の開示、訂正、利用停止、削除等を求めることができます。
          ご希望の場合は、上記お問い合わせ先までご連絡ください。本人確認のうえ、法令に従い遅滞なく
          対応します。
        </p>
        <p class="mt-2">※アカウント削除専用の機能は現在準備中です。</p>
      </section>

      <section>
        <h2 class="mb-2 font-semibold text-gray-900 dark:text-ink">
          8. グループ機能における公開範囲
        </h2>
        <p>
          トレーニング記録・リアクション・コメントは、ユーザーが参加しているグループの他のメンバーに
          表示されます。表示名は、同じグループの他のメンバーおよび記録に対してリアクション・コメントを
          行った際に、そのやり取りの相手に表示されます。
        </p>
      </section>

      <section>
        <h2 class="mb-2 font-semibold text-gray-900 dark:text-ink">9. 情報の保存期間</h2>
        <p>
          ユーザーの情報は、アカウントが存在する間保存します。ただし、長期間本サービスの利用がない
          アカウントについては、事前に通知のうえ情報を削除することがあります。
        </p>
      </section>

      <section>
        <h2 class="mb-2 font-semibold text-gray-900 dark:text-ink">10. 本ポリシーの変更</h2>
        <p>
          運営者は、必要と判断した場合には、本ポリシーの内容を変更することがあります。変更後の内容は、
          本サービス上に表示した時点から効力を生じます。
        </p>
      </section>
    </div>
  </div>
</template>
